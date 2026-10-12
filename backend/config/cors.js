import env from './env.js';

// Shared by Express and Socket.IO so both accept exactly the same origins.
export const corsOptions = {
  origin(origin, callback) {
    // Requests without an Origin header (curl, server-to-server, health checks) are allowed.
    if (!origin || env.clientUrls.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  // Browsers may reuse a preflight answer for 10 minutes.
  maxAge: 600,
};
