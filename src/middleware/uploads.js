const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { env } = require('../config/env');

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function imageFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_MIMES.has(file.mimetype) || !ALLOWED_EXTENSIONS.has(ext)) {
    const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname);
    error.code = 'INVALID_FILE_TYPE';
    return cb(error);
  }
  return cb(null, true);
}

function makeStorage(destination, prefix) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, destination),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${prefix}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  });
}

const commonLimits = { fileSize: 5 * 1024 * 1024 };

const productUpload = multer({
  storage: makeStorage(env.productsDir, 'producto'),
  fileFilter: imageFilter,
  limits: { ...commonLimits, files: 6 },
});

const bannerUpload = multer({
  storage: makeStorage(env.bannersDir, 'banner'),
  fileFilter: imageFilter,
  limits: { ...commonLimits, files: 1 },
});

const receiptUpload = multer({
  storage: makeStorage(env.receiptsDir, 'comprobante'),
  fileFilter: imageFilter,
  limits: { ...commonLimits, files: 1 },
});

function removeUploadedFile(filePath) {
  if (!filePath) return;
  const fs = require('fs');
  const absolute = path.isAbsolute(filePath) ? filePath : path.join(env.uploadDir, filePath.replace(/^\/uploads\//, ''));
  if (fs.existsSync(absolute)) {
    try { fs.unlinkSync(absolute); } catch (_) { /* noop */ }
  }
}

module.exports = { productUpload, bannerUpload, receiptUpload, removeUploadedFile };
