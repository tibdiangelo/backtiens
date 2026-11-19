const express = require('express');
const { query, param } = require('express-validator');
const productsRepo = require('../repositories/products.repo');
const categoriesRepo = require('../repositories/categories.repo');
const bannersRepo = require('../repositories/banners.repo');
const settingsRepo = require('../repositories/settings.repo');
const { validate } = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../utils/helpers');

const router = express.Router();

router.get('/products', validate([
  query('q').optional().trim().isLength({ max: 100 }),
  query('categoria').optional().trim().isLength({ max: 100 }),
]), asyncHandler(async (req, res) => {
  const products = productsRepo.listPublic({
    q: req.query.q || '',
    categoria: req.query.categoria || '',
  });
  res.json({ productos: products, total: products.length });
}));

router.get('/products/:id', validate([
  param('id').isInt({ min: 1 }).withMessage('Producto inválido.'),
]), asyncHandler(async (req, res) => {
  const product = productsRepo.findPublicById(Number(req.params.id));
  if (!product) throw new ApiError(404, 'Producto no encontrado.');
  res.json({ producto: product });
}));

router.get('/categories', asyncHandler(async (req, res) => {
  res.json({ categorias: categoriesRepo.list() });
}));

router.get('/banners', asyncHandler(async (req, res) => {
  res.json({ banners: bannersRepo.listPublic() });
}));

router.get('/payment-info', asyncHandler(async (req, res) => {
  const config = settingsRepo.getPublic();
  res.json({ configuracion: config });
}));

module.exports = router;
