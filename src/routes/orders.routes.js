const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { optionalAuth, verifyToken } = require('../middleware/auth');
const { orderLimiter } = require('../middleware/rateLimits');
const { receiptUpload, removeUploadedFile } = require('../middleware/uploads');
const { asyncHandler, ApiError } = require('../utils/helpers');
const ordersService = require('../services/orders.service');
const ordersRepo = require('../repositories/orders.repo');

const router = express.Router();

function fileValidation(rules) {
  return [
    ...rules,
    (req, res, next) => {
      const result = validationResult(req);
      if (result.isEmpty()) return next();
      if (req.file) removeUploadedFile(req.file.path);
      const errors = result.array().map((error) => ({ campo: error.path, mensaje: error.msg }));
      return next(new ApiError(422, 'Revisa los datos ingresados.', errors));
    },
  ];
}

function parseItems(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(value)) throw new Error();
    return value;
  } catch (_) {
    throw new ApiError(422, 'El contenido del carrito no es válido.');
  }
}

function publicOrder(order) {
  const { comprobante_url, usuario_email, ...rest } = order;
  return rest;
}

function trackingOrder(order) {
  return {
    id: order.id,
    codigo: order.codigo,
    nombre: order.nombre,
    email: order.email,
    telefono: order.telefono,
    ciudad: order.ciudad,
    direccion: order.direccion,
    notas: order.notas,
    total: order.total,
    estado: order.estado,
    motivo_rechazo: order.motivo_rechazo,
    pedido_externo: order.pedido_externo,
    numero_guia: order.numero_guia,
    transportadora: order.transportadora,
    created_at: order.created_at,
    items: order.items,
    historial: order.historial.map(({ estado_anterior, estado_nuevo, fecha, nota }) => ({
      estado_anterior, estado_nuevo, fecha, nota,
    })),
  };
}

router.post('/orders', orderLimiter, optionalAuth, receiptUpload.single('comprobante'), fileValidation([
  body('nombre').trim().isLength({ min: 2, max: 100 }).withMessage('Ingresa el nombre de quien recibe.'),
  body('telefono').trim().isLength({ min: 7, max: 30 }).withMessage('Ingresa un teléfono válido.')
    .custom((value) => /^\+?\d{7,15}$/.test(ordersService.normalizePhone(value))).withMessage('Ingresa un teléfono válido.'),
  body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('El correo no es válido.'),
  body('ciudad').trim().isLength({ min: 2, max: 80 }).withMessage('Ingresa la ciudad.'),
  body('direccion').trim().isLength({ min: 5, max: 200 }).withMessage('Ingresa una dirección completa.'),
  body('notas').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
  body('items').custom((value) => {
    const items = parseItems(value);
    if (!items.length) throw new Error('El carrito está vacío.');
    return true;
  }),
]), asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(422, 'El comprobante de pago es obligatorio.');
  try {
    const order = ordersService.createOrder({
      cliente: {
        nombre: req.body.nombre.trim(),
        telefono: req.body.telefono.trim(),
        email: req.body.email || '',
        ciudad: req.body.ciudad.trim(),
        direccion: req.body.direccion.trim(),
        notas: (req.body.notas || '').trim(),
      },
      usuarioId: req.user?.rol === 'cliente' ? req.user.id : null,
      items: parseItems(req.body.items),
      receiptFilename: req.file.filename,
    });
    res.status(201).json({ pedido: publicOrder(order) });
  } catch (error) {
    removeUploadedFile(req.file.path);
    throw error;
  }
}));

router.get('/orders/track', orderLimiter, [
  query('codigo').trim().notEmpty().withMessage('Ingresa el código del pedido.'),
  query('telefono').trim().notEmpty().withMessage('Ingresa el teléfono del pedido.'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ApiError(422, errors.array()[0].msg);
  const order = ordersRepo.findByTracking(
    String(req.query.codigo).trim(),
    ordersService.normalizePhone(req.query.telefono),
  );
  if (!order) throw new ApiError(404, 'No encontramos un pedido con ese código y teléfono.');
  const full = ordersRepo.findById(order.id);
  res.json({ pedido: trackingOrder(full) });
}));

router.patch('/orders/:id/receipt', orderLimiter, optionalAuth, receiptUpload.single('comprobante'), asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(422, 'Debes adjuntar el nuevo comprobante.');
  try {
    const order = ordersService.resubmitReceipt(Number(req.params.id), {
      codigo: req.body.codigo,
      telefono: req.body.telefono,
      receiptFilename: req.file.filename,
      usuarioId: req.user?.rol === 'cliente' ? req.user.id : null,
    });
    res.json({ pedido: trackingOrder(order) });
  } catch (error) {
    removeUploadedFile(req.file.path);
    throw error;
  }
}));

router.get('/my-orders', verifyToken, asyncHandler(async (req, res) => {
  const orders = ordersRepo.listByUser(req.user.id);
  res.json({ pedidos: orders.map(publicOrder) });
}));

module.exports = router;
