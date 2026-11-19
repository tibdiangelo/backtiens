const express = require('express');
const { body, param, validationResult } = require('express-validator');
const productsRepo = require('../../repositories/products.repo');
const categoriesRepo = require('../../repositories/categories.repo');
const { verifyToken, verifyRole } = require('../../middleware/auth');
const { productUpload, removeUploadedFile } = require('../../middleware/uploads');
const { asyncHandler, ApiError, slugify } = require('../../utils/helpers');

const router = express.Router();
router.use(verifyToken, verifyRole('admin'));

function validationWithFiles(rules) {
  return [
    ...rules,
    (req, res, next) => {
      const result = validationResult(req);
      if (result.isEmpty()) return next();
      (req.files || []).forEach((file) => removeUploadedFile(file.path));
      const errors = result.array().map((error) => ({ campo: error.path, mensaje: error.msg }));
      return next(new ApiError(422, 'Revisa los datos del formulario.', errors));
    },
  ];
}

function productRules() {
  return [
    body('nombre').trim().isLength({ min: 2, max: 150 }).withMessage('El nombre es obligatorio.'),
    body('descripcion').optional({ checkFalsy: true }).trim().isLength({ max: 3000 }),
    body('precio').isInt({ min: 0 }).withMessage('El precio debe ser un número entero en pesos.'),
    body('stock').isInt({ min: 0 }).withMessage('El stock debe ser un número entero mayor o igual a cero.'),
    body('categoria_id').optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage('Categoría inválida.'),
    body('activo').optional().isIn(['0', '1', 'true', 'false']),
  ];
}

function parseProduct(req) {
  return {
    nombre: req.body.nombre.trim(),
    descripcion: (req.body.descripcion || '').trim(),
    precio: Number(req.body.precio),
    stock: Number(req.body.stock),
    categoria_id: req.body.categoria_id ? Number(req.body.categoria_id) : null,
    activo: req.body.activo === undefined || !['0', 'false'].includes(String(req.body.activo)) ? 1 : 0,
  };
}

function validateCategory(categoriaId) {
  if (categoriaId && !categoriesRepo.findById(categoriaId)) {
    throw new ApiError(422, 'La categoría seleccionada no existe.');
  }
}

router.get('/products', asyncHandler(async (req, res) => {
  res.json({ productos: productsRepo.listAdmin() });
}));

router.post('/products', productUpload.array('imagenes', 6), validationWithFiles(productRules()), asyncHandler(async (req, res) => {
  const files = req.files || [];
  try {
    const data = parseProduct(req);
    validateCategory(data.categoria_id);
    const imagenUrls = files.map((file) => `/uploads/products/${file.filename}`);
    const product = productsRepo.create({ ...data, imagenUrls });
    res.status(201).json({ producto: product });
  } catch (error) {
    files.forEach((file) => removeUploadedFile(file.path));
    throw error;
  }
}));

router.put('/products/:id', productUpload.array('imagenes', 6), validationWithFiles([
  param('id').isInt({ min: 1 }),
  ...productRules(),
]), asyncHandler(async (req, res) => {
  const files = req.files || [];
  const id = Number(req.params.id);
  try {
    const existing = productsRepo.findById(id);
    if (!existing) throw new ApiError(404, 'Producto no encontrado.');
    const data = parseProduct(req);
    validateCategory(data.categoria_id);
    productsRepo.update(id, data, { usuarioId: req.user.id });
    if (files.length) {
      productsRepo.addImages(id, files.map((file) => `/uploads/products/${file.filename}`));
    }
    res.json({ producto: productsRepo.findById(id) });
  } catch (error) {
    files.forEach((file) => removeUploadedFile(file.path));
    throw error;
  }
}));

router.delete('/products/:id/images/:imageId', asyncHandler(async (req, res) => {
  const productoId = Number(req.params.id);
  const imageId = Number(req.params.imageId);
  const image = productsRepo.findImage(productoId, imageId);
  if (!image) throw new ApiError(404, 'Imagen no encontrada.');
  productsRepo.removeImage(productoId, imageId);
  removeUploadedFile(image.url);
  res.json({ producto: productsRepo.findById(productoId) });
}));

router.patch('/products/:id/stock', [
  param('id').isInt({ min: 1 }),
  body('stock').optional().isInt({ min: 0 }).withMessage('El stock debe ser mayor o igual a cero.'),
  body('delta').optional().isInt().withMessage('El ajuste debe ser un número entero.'),
  body('motivo').optional({ checkFalsy: true }).trim().isLength({ max: 200 }),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ApiError(422, errors.array()[0].msg);
  const product = productsRepo.findById(Number(req.params.id));
  if (!product) throw new ApiError(404, 'Producto no encontrado.');

  let newStock;
  if (req.body.delta !== undefined) newStock = product.stock + Number(req.body.delta);
  else if (req.body.stock !== undefined) newStock = Number(req.body.stock);
  else throw new ApiError(422, 'Indica el nuevo stock o el ajuste.');

  if (!Number.isInteger(newStock) || newStock < 0) throw new ApiError(422, 'El stock no puede ser negativo.');
  const updated = productsRepo.adjustStock(
    product.id,
    newStock,
    req.user.id,
    (req.body.motivo || '').trim() || 'Ajuste manual de stock',
  );
  res.json({ producto: updated });
}));

router.get('/products/:id/stock-movements', asyncHandler(async (req, res) => {
  const product = productsRepo.findById(Number(req.params.id));
  if (!product) throw new ApiError(404, 'Producto no encontrado.');
  res.json({ movimientos: productsRepo.stockMovements(product.id) });
}));

router.delete('/products/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const product = productsRepo.findById(id);
  if (!product) throw new ApiError(404, 'Producto no encontrado.');
  const result = productsRepo.remove(id, { usuarioId: req.user.id });
  result.images.forEach((image) => removeUploadedFile(image.url));
  res.json({
    mensaje: result.softDeleted
      ? 'El producto tiene historial asociado; se desactivó y conservó su historial.'
      : 'Producto eliminado.',
  });
}));

// Categorías (solo admin)
router.get('/categories', asyncHandler(async (req, res) => {
  res.json({ categorias: categoriesRepo.list() });
}));

router.post('/categories', [
  body('nombre').trim().isLength({ min: 2, max: 80 }).withMessage('El nombre es obligatorio.'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ApiError(422, errors.array()[0].msg);
  const nombre = req.body.nombre.trim();
  const baseSlug = slugify(nombre);
  const existing = categoriesRepo.findBySlug(baseSlug);
  if (existing) throw new ApiError(409, 'Ya existe una categoría con ese nombre.');
  const category = categoriesRepo.create({ nombre, slug: baseSlug });
  res.status(201).json({ categoria: category });
}));

router.put('/categories/:id', [
  param('id').isInt({ min: 1 }),
  body('nombre').trim().isLength({ min: 2, max: 80 }).withMessage('El nombre es obligatorio.'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ApiError(422, errors.array()[0].msg);
  const id = Number(req.params.id);
  if (!categoriesRepo.findById(id)) throw new ApiError(404, 'Categoría no encontrada.');
  const nombre = req.body.nombre.trim();
  const slug = slugify(nombre);
  const existing = categoriesRepo.findBySlug(slug);
  if (existing && existing.id !== id) throw new ApiError(409, 'Ya existe una categoría con ese nombre.');
  res.json({ categoria: categoriesRepo.update(id, { nombre, slug }) });
}));

router.delete('/categories/:id', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!categoriesRepo.findById(id)) throw new ApiError(404, 'Categoría no encontrada.');
  const removed = categoriesRepo.remove(id);
  if (!removed) throw new ApiError(409, 'No puedes eliminar una categoría que tiene productos.');
  res.json({ mensaje: 'Categoría eliminada.' });
}));

module.exports = router;
