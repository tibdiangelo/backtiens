require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { env, ensureAppDirectories } = require('./config/env');
const { initializeDatabase } = require('./config/db');
const settingsRepo = require('./repositories/settings.repo');
const { apiLimiter } = require('./middleware/rateLimits');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const publicRoutes = require('./routes/public.routes');
const profileRoutes = require('./routes/profile.routes');
const orderRoutes = require('./routes/orders.routes');
const adminOrderRoutes = require('./routes/admin/orders.routes');
const adminCatalogRoutes = require('./routes/admin/catalog.routes');
const adminBannerRoutes = require('./routes/admin/banners.routes');
const adminCustomerRoutes = require('./routes/admin/customers.routes');
const adminSettingsRoutes = require('./routes/admin/settings.routes');

ensureAppDirectories();
initializeDatabase();
settingsRepo.ensureDefaults();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const allowedOrigins = env.corsOrigin.split(',').map((origin) => origin.trim()).filter(Boolean);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origen no permitido por CORS.'));
  },
  credentials: false,
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

app.use('/uploads/products', express.static(env.productsDir, { maxAge: '7d', fallthrough: true }));
app.use('/uploads/banners', express.static(env.bannersDir, { maxAge: '7d', fallthrough: true }));

app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, fecha: new Date().toISOString() }));

app.use('/api', apiLimiter);
app.use('/api/auth', authRoutes);
app.use('/api', publicRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api', orderRoutes);
app.use('/api/admin', adminOrderRoutes);
app.use('/api/admin', adminCatalogRoutes);
app.use('/api/admin', adminBannerRoutes);
app.use('/api/admin', adminCustomerRoutes);
app.use('/api/admin', adminSettingsRoutes);

app.use('/api', notFound);

app.get('/', (req, res) => {
  res.json({ mensaje: 'API de Productos Naturales Tiens Colombia activa. Consulta /api/health.' });
});

app.use(errorHandler);

const server = app.listen(env.port, () => {
  console.log(`✔ API Productos Naturales Tiens Colombia escuchando en http://localhost:${env.port}`);
  console.log(`  Entorno: ${env.nodeEnv}`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

module.exports = app;
