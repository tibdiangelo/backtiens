const express = require('express');
const { body, param, validationResult } = require('express-validator');
const bannersRepo = require('../../repositories/banners.repo');
const { verifyToken, verifyRole } = require('../../middleware/auth');
const { bannerUpload, removeUploadedFile } = require('../../middleware/uploads');
const { asyncHandler, ApiError } = require('../../utils/helpers');

const router = express.Router();
router.use(verifyToken, verifyRole('admin'));

function handleValidation(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  if (req.file) removeUploadedFile(req.file.path);
  return next(new ApiError(422, result.array()[0].msg));
}

const rules = [
  body('titulo').trim().isLength({ min: 2, max: 150 }).withMessage('El título es obligatorio.'),
  body('enlace').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  body('activo').optional().isIn(['0', '1', 'true', 'false']),
];

function parseBanner(req) {
  return {
    titulo: req.body.titulo.trim(),
    enlace: (req.body.enlace || '').trim(),
    activo: req.body.activo === undefined || !['0', 'false'].includes(String(req.body.activo)) ? 1 : 0,
  };
}

router.get('/banners', asyncHandler(async (req, res) => {
  res.json({ banners: bannersRepo.listAll() });
}));

router.post('/banners', bannerUpload.single('imagen'), rules, handleValidation, asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(422, 'La imagen del banner es obligatoria.');
  try {
    const banner = bannersRepo.create({
      ...parseBanner(req),
      imagen_url: `/uploads/banners/${req.file.filename}`,
    });
    res.status(201).json({ banner });
  } catch (error) {
    removeUploadedFile(req.file.path);
    throw error;
  }
}));

router.put('/banners/reorder', [
  body('ids').isArray({ min: 1 }).withMessage('Orden inválido.'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ApiError(422, errors.array()[0].msg);
  const ids = req.body.ids.map(Number);
  const existing = bannersRepo.listAll().map((banner) => banner.id);
  if (ids.length !== existing.length || ids.some((id) => !existing.includes(id))) {
    throw new ApiError(422, 'El orden enviado no coincide con los banners existentes.');
  }
  res.json({ banners: bannersRepo.reorder(ids) });
}));

router.put('/banners/:id', bannerUpload.single('imagen'), [
  param('id').isInt({ min: 1 }),
  ...rules,
], handleValidation, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const existing = bannersRepo.findById(id);
  if (!existing) {
    if (req.file) removeUploadedFile(req.file.path);
    throw new ApiError(404, 'Banner no encontrado.');
  }
  try {
    const banner = bannersRepo.update(id, {
      ...parseBanner(req),
      imagen_url: req.file ? `/uploads/banners/${req.file.filename}` : existing.imagen_url,
    });
    if (req.file) removeUploadedFile(existing.imagen_url);
    res.json({ banner });
  } catch (error) {
    if (req.file) removeUploadedFile(req.file.path);
    throw error;
  }
}));

router.delete('/banners/:id', asyncHandler(async (req, res) => {
  const banner = bannersRepo.findById(Number(req.params.id));
  if (!banner) throw new ApiError(404, 'Banner no encontrado.');
  bannersRepo.remove(banner.id);
  removeUploadedFile(banner.imagen_url);
  res.json({ mensaje: 'Banner eliminado.' });
}));

module.exports = router;
