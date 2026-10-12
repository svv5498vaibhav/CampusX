import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import env from './config/env.js';
import { corsOptions } from './config/cors.js';
import { REQUEST_RULES } from './config/securityConfig.js';
import { requestLogger } from './middleware/requestLogger.js';
import { apiRateLimiter } from './middleware/rateLimiter.js';
import { sanitizeRequest } from './middleware/sanitizeMiddleware.js';
import { notFound } from './middleware/notFoundMiddleware.js';
import { errorHandler } from './middleware/errorMiddleware.js';
import apiRoutes from './routes/index.js';

const BODY_LIMIT = REQUEST_RULES.bodyLimit; // JSON/form bodies only; uploads go through multer with their own limits.

/*
 * Security headers for a JSON API (the frontend is served separately and sets its own page policy).
 * Nothing here is ever rendered as a page, so the CSP allows nothing at all and no site may frame it.
 * HSTS only in production, where the API is served over HTTPS.
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: { defaultSrc: ["'none'"], baseUri: ["'none'"], formAction: ["'none'"], frameAncestors: ["'none'"] },
  },
  xFrameOptions: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
  strictTransportSecurity: env.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
});

/** API responses carry personal data: never stored by browsers or shared caches unless a route says otherwise. */
const noStoreByDefault = (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
};

const app = express();

app.disable('x-powered-by');
if (env.trustProxy) app.set('trust proxy', env.trustProxy);

// Security headers, CORS and logging come first so they also apply to error responses.
app.use(securityHeaders);
app.use(cors(corsOptions));
app.use(requestLogger);
app.use('/api', noStoreByDefault);

// Body parsing with size limits, then input hardening.
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
app.use(cookieParser());
app.use(sanitizeRequest);
// Must run after sanitizeRequest: hpp edits req.query in place, which only sticks
// once sanitizeRequest has pinned Express 5's computed req.query to a plain object.
app.use(hpp());

app.use('/api', apiRateLimiter);
app.use(env.apiPrefix, apiRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
