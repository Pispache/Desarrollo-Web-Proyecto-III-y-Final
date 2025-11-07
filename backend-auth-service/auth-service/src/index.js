require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const passport = require('passport');
const db = require('./config/database');
const authRoutes = require('./routes/auth');
const seedAdminFromEnv = require('./seed/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy (requerido detrás de Nginx para cookies secure)
app.set('trust proxy', 1);

// Seguridad HTTP headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

// Compresión HTTP
app.use(compression());

// CORS (estricto en producción)
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
const isProd = (process.env.NODE_ENV === 'production');
app.use(cors({
  origin: (origin, cb) => {
    if (!isProd) return cb(null, true);
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session
const cookieSecureEnv = String(process.env.SESSION_COOKIE_SECURE || '').toLowerCase();
const cookieSecure = cookieSecureEnv === 'true' ? true : cookieSecureEnv === 'false' ? false : (process.env.NODE_ENV === 'production');
const cookieSameSite = process.env.SESSION_COOKIE_SAMESITE || (process.env.NODE_ENV === 'production' ? 'lax' : 'lax');
const cookieDomain = process.env.SESSION_COOKIE_DOMAIN || undefined;
const sessionCookieOptions = {
  secure: cookieSecure,
  httpOnly: true,
  sameSite: cookieSameSite,
  maxAge: 24 * 60 * 60 * 1000
};
if (cookieDomain) { sessionCookieOptions.domain = cookieDomain; }

// Validate SESSION_SECRET in production (fail-fast)
const sessionSecret = process.env.SESSION_SECRET || '';
if (isProd && (!sessionSecret || sessionSecret === 'default-secret-change-this')) {
  console.error('SESSION_SECRET must be configured with a strong value in production.');
  process.exit(1);
}

app.use(session({
  secret: sessionSecret || 'default-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: sessionCookieOptions
}));

// Passport
app.use(passport.initialize());
app.use(passport.session());
require('./config/passport');

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'auth-service-nodejs',
    timestamp: new Date().toISOString(),
    database: db.isReady() ? 'connected' : 'disconnected'
  });
});

// Routes
// Rate limiting para rutas de autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300, // 300 req por IP por ventana
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/auth', authLimiter, authRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Initialize database, seed admin (if configured) and start server
db.initialize()
  .then(async () => {
    await seedAdminFromEnv(console);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Auth Service running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log(`💾 Database: MongoDB connected`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to initialize:', err);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  await db.disconnect();
  process.exit(0);
});
