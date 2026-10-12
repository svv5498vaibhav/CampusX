import dns from 'node:dns';
import mongoose from 'mongoose';
import env from './env.js';
import logger from '../utils/logger.js';

// Drop query conditions on paths that are not in the schema (defence against operator injection).
mongoose.set('strictQuery', true);

/*
 * Index strategy: each model declares its own indexes in its schema
 * (`unique: true`, `index: true`, `schema.index({ author: 1, createdAt: -1 })`).
 * Mongoose builds them when the model is first used (autoIndex, on by default).
 * If collections grow large, disable autoIndex in production and run
 * `Model.syncIndexes()` as a deploy step instead.
 *
 * Start-up waits for those builds (up to INDEX_WAIT_MS) before the server listens: on a brand-new
 * database the first requests could otherwise arrive before the text indexes ($text search) or the
 * unique indexes (one account per email) exist. Existing indexes make this wait a few milliseconds.
 */
const INDEX_WAIT_MS = 30_000;

const READY_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

let hasConnected = false;
let isClosing = false;

mongoose.connection.on('disconnected', () => {
  if (hasConnected && !isClosing) logger.warn('MongoDB disconnected - Mongoose will keep trying to reconnect');
});
mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));
mongoose.connection.on('error', (error) => {
  if (hasConnected) logger.error(`MongoDB error: ${error.message}`);
});

// Used for mongodb+srv lookups only when Node.js has no working DNS server and DNS_SERVERS is empty.
const FALLBACK_DNS_SERVERS = ['8.8.8.8', '1.1.1.1'];

/** Driver messages can quote the connection string; never let credentials reach the logs. */
const hideCredentials = (text) => String(text ?? '').replace(/(mongodb(?:\+srv)?:\/\/)[^@\s/]*@/gi, '$1***@');

/**
 * mongodb+srv:// URIs (MongoDB Atlas) are resolved with SRV and TXT DNS queries, which Node.js sends
 * through its own resolver rather than the operating system's. On some Windows machines that resolver
 * can't read the system DNS settings and falls back to 127.0.0.1, where nothing answers, so every
 * lookup fails with "querySrv ECONNREFUSED" although nslookup works.
 *
 * DNS_SERVERS, when set, is always used for these lookups. Otherwise, only when that exact failure
 * happens, they are sent to public DNS instead. Ordinary hostname lookups (dns.lookup) keep using
 * the operating system resolver either way.
 */
async function ensureSrvDns(uri) {
  const srvHost = /^mongodb\+srv:\/\/(?:[^@/]*@)?([^/?,]+)/i.exec(uri)?.[1];
  if (!srvHost) return;

  if (env.dnsServers.length > 0) {
    dns.setServers(env.dnsServers);
    logger.info(`MongoDB: SRV lookups use DNS_SERVERS (${env.dnsServers.join(', ')})`);
    return;
  }

  try {
    await dns.promises.resolveSrv(`_mongodb._tcp.${srvHost}`);
  } catch (error) {
    // Any other DNS answer (no such record, timeout, ...) is real; the driver reports it.
    if (error.code !== 'ECONNREFUSED') return;
    const unusable = dns.getServers().join(', ') || 'none';
    dns.setServers(FALLBACK_DNS_SERVERS);
    logger.warn(
      `MongoDB: Node.js could not use this computer's DNS servers (it tried ${unusable}), so SRV lookups ` +
        `now use ${FALLBACK_DNS_SERVERS.join(', ')}. Set DNS_SERVERS in backend/.env to choose different servers.`,
    );
  }
}

/** A short, credential-free explanation of why the first connection failed. */
function explainConnectionError(error) {
  const code = error?.code ?? error?.cause?.code;
  const message = String(error?.message ?? '');

  if (/^query(Srv|Txt)\b/.test(message) || ['querySrv', 'queryTxt'].includes(error?.syscall)) {
    return `DNS lookup for the MongoDB Atlas cluster failed (${code ?? 'DNS error'}). Check your internet connection and DNS, or set DNS_SERVERS in backend/.env.`;
  }
  if (['MongoParseError', 'MongoAPIError'].includes(error?.name) || /invalid scheme|connection string/i.test(message)) {
    return 'MONGODB_URI is not a valid MongoDB connection string. Copy it again from MongoDB Atlas (Connect → Drivers).';
  }
  if (code === 18 || code === 8000 || error?.codeName === 'AuthenticationFailed' || /auth(entication)? failed|bad auth/i.test(message)) {
    return 'MongoDB authentication failed. Check the database user name and password in MONGODB_URI (special characters in the password must be URL-encoded).';
  }
  if (['MongooseServerSelectionError', 'MongoServerSelectionError'].includes(error?.name)) {
    if (/ECONNREFUSED/.test(message)) {
      return 'Nothing is accepting MongoDB connections at that address. Start MongoDB, or check the host and port in MONGODB_URI.';
    }
    return /mongodb\.net/i.test(message) || env.mongodbUri.includes('mongodb.net')
      ? 'No MongoDB Atlas server answered in time. Check Atlas Network Access (this computer\'s IP address must be allowed) and that the cluster is running.'
      : 'No MongoDB server answered in time. Check that MongoDB is running and reachable.';
  }
  if (error?.name === 'MongoNetworkError' || ['ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'ECONNREFUSED'].includes(code)) {
    return `Network error while connecting to MongoDB (${code ?? error.name}). Check your connection, firewall or VPN.`;
  }
  return 'MongoDB could not be reached.';
}

/**
 * Connects using MONGODB_URI. Without it, development runs DB-less with a
 * warning (production refuses to start, see config/env.js). A URI that cannot
 * be reached fails startup with a clear message. The URI itself is never logged.
 */
export async function connectDatabase() {
  if (!env.mongodbUri) {
    logger.warn('MongoDB: MONGODB_URI is not set - running without a database (development only)');
    return false;
  }

  try {
    await ensureSrvDns(env.mongodbUri);
    await mongoose.connect(env.mongodbUri, { serverSelectionTimeoutMS: 10_000 });
  } catch (error) {
    throw new Error(
      `MongoDB connection failed: ${explainConnectionError(error)} [${hideCredentials(error.message)}] Check MONGODB_URI in backend/.env.`,
      { cause: error },
    );
  }

  hasConnected = true;
  const { host, name } = mongoose.connection;
  logger.info(`MongoDB connected successfully (host: ${host}, database: ${name})`);
  await waitForIndexes();
  if (name === 'test' && !/^mongodb(?:\+srv)?:\/\/[^/]+\/[^/?]+/i.test(env.mongodbUri)) {
    logger.warn('MongoDB: MONGODB_URI names no database, so MongoDB\'s default "test" is used. Add /campusx before the "?" in MONGODB_URI to use a "campusx" database.');
  }
  return true;
}

/**
 * Waits for every registered model's index build (Model.init() returns the build Mongoose already
 * started, so nothing is built twice). Build failures are logged by watchIndexBuild and don't stop
 * start-up; a build still running after INDEX_WAIT_MS is logged and left to finish in the background.
 */
async function waitForIndexes() {
  const builds = Promise.allSettled(Object.values(mongoose.models).map((model) => model.init()));
  let timer;
  const timedOut = await Promise.race([
    builds.then(() => false),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(true), INDEX_WAIT_MS);
      timer.unref?.();
    }),
  ]);
  clearTimeout(timer);
  if (timedOut) logger.warn(`MongoDB: index builds still running after ${INDEX_WAIT_MS / 1000} s - starting anyway; search may fail until they finish`);
}

/**
 * Mongoose builds schema indexes in the background and drops failures silently. A missing
 * unique index means duplicates slip through, so failures are logged loudly instead.
 */
export function watchIndexBuild(model) {
  model.on('index', (error) => {
    if (error) logger.error(`MongoDB index build failed for ${model.modelName}: ${error.message}`);
  });
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState === 0) return;

  isClosing = true;
  await mongoose.disconnect();
  logger.info('MongoDB connection closed');
}

/** 'connected' | 'connecting' | 'disconnected' | 'disconnecting' | 'not_configured' */
export function getDatabaseStatus() {
  if (!env.mongodbUri) return 'not_configured';
  return READY_STATES[mongoose.connection.readyState] ?? 'unknown';
}
