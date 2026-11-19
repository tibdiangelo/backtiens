const path = require('path');
const fs = require('fs');

const BACKEND_ROOT = path.resolve(__dirname, '../..');

const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  databasePath: path.resolve(BACKEND_ROOT, process.env.DATABASE_PATH || './data/tienda.db'),
  uploadDir: path.resolve(BACKEND_ROOT, process.env.UPLOAD_DIR || './uploads'),
  privateDir: path.resolve(BACKEND_ROOT, process.env.PRIVATE_DIR || './private'),
  isProduction: process.env.NODE_ENV === 'production',
};

env.productsDir = path.join(env.uploadDir, 'products');
env.bannersDir = path.join(env.uploadDir, 'banners');
env.receiptsDir = path.join(env.privateDir, 'receipts');

function ensureAppDirectories() {
  [env.productsDir, env.bannersDir, env.receiptsDir].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));
}

module.exports = { env, ensureAppDirectories, BACKEND_ROOT };
