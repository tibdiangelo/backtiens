const express = require('express');
const fs = require('fs');
const path = require('path');
const { body, param, query, validationResult } = require('express-validator');
const ordersRepo = require('../../repositories/orders.repo');
const ordersService = require('../../services/orders.service');
const { env } = require('../../config/env');
const { verifyToken, verifyRole } = require('../../middleware/auth');
const { asyncHandler, ApiError } = require('../../utils/helpers');

const router = express.Router();
router.use(verifyToken, verifyRole('admin', 'operador'));

function adminOrder(order) {
  if (!order) return order;
  const { comprobante_url, ...rest } = order;
  return { ...rest, tiene_comprobante: Boolean(comprobante_url) };
}

router.get('/orders', validateQuery([
  query('estado').optional({ checkFalsy: true }).isIn(ordersService.ESTADOS).withMessage('Estado inválido.'),
  query('q').optional().trim().isLength({ max: 100 }),
  query('orden').optional().isIn(['asc', 'desc']),
]), asyncHandler(async (req, res) => {
  const orders = ordersRepo.listAdmin({
    estado: req.query.estado || '',
    q: req.query.q || '',
    orden: req.query.orden || 'desc',
  });
  res.json({ pedidos: orders.map(adminOrder), total: orders.length });
}));

router.get('/orders/:id', validateQuery([
  param('id').isInt({ min: 1 }),
]), asyncHandler(async (req, res) => {
  const order = ordersRepo.findById(Number(req.params.id));
  if (!order) throw new ApiError(404, 'Pedido no encontrado.');
  res.json({ pedido: adminOrder(order) });
}));

router.get('/orders/:id/receipt', validateQuery([
  param('id').isInt({ min: 1 }),
]), asyncHandler(async (req, res) => {
  const filename = ordersRepo.receiptFilename(Number(req.params.id));
  if (!filename) throw new ApiError(404, 'Este pedido no tiene comprobante.');
  const safeName = path.basename(filename);
  const absolute = path.join(env.receiptsDir, safeName);
  if (!fs.existsSync(absolute)) throw new ApiError(404, 'El archivo del comprobante no está disponible.');
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(absolute);
}));

router.patch('/orders/:id/status', validateQuery([
  param('id').isInt({ min: 1 }),
  body('estado').isIn(ordersService.ESTADOS).withMessage('Estado inválido.'),
  body('motivo').optional({ checkFalsy: true }).trim().isLength({ max: 500 }),
]), asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ApiError(422, errors.array()[0].msg);
  const order = ordersService.updateStatus(Number(req.params.id), req.body.estado, req.user, {
    motivo: req.body.motivo || '',
  });
  res.json({ pedido: adminOrder(order) });
}));

router.patch('/orders/:id/shipping', validateQuery([
  param('id').isInt({ min: 1 }),
  body('pedido_externo').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('numero_guia').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
  body('transportadora').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
]), asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ApiError(422, errors.array()[0].msg);
  const order = ordersService.updateShipping(Number(req.params.id), {
    pedido_externo: req.body.pedido_externo || '',
    numero_guia: req.body.numero_guia || '',
    transportadora: req.body.transportadora || '',
  }, req.user);
  res.json({ pedido: adminOrder(order) });
}));

function validateQuery(rules) {
  return [
    ...rules,
    (req, res, next) => {
      const result = validationResult(req);
      if (result.isEmpty()) return next();
      return next(new ApiError(422, result.array()[0].msg));
    },
  ];
}

module.exports = router;
