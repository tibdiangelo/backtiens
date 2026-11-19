const express = require('express');
const { body, query, validationResult } = require('express-validator');
const customersRepo = require('../../repositories/customers.repo');
const { verifyToken, verifyRole } = require('../../middleware/auth');
const { asyncHandler, ApiError, csvEscape, formatCop } = require('../../utils/helpers');

const router = express.Router();
router.use(verifyToken, verifyRole('admin'));

function customersQuery(req) {
  return {
    q: req.query.q || '',
    filtro: req.query.filtro || '',
  };
}

router.get('/customers', [
  query('filtro').optional({ checkFalsy: true }).isIn(['frecuente', 'inactivo', 'nuevo', 'regular']),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ApiError(422, 'Filtro inválido.');
  const customers = customersRepo.list(customersQuery(req));
  res.json({ clientes: customers, total: customers.length });
}));

router.get('/customers/export.csv', asyncHandler(async (req, res) => {
  const customers = customersRepo.list(customersQuery(req));
  const header = ['Nombre', 'Telefono', 'Correo', 'Direccion', 'Ciudad', 'Pedidos', 'Total gastado', 'Ultimo pedido', 'Frecuencia (dias)', 'Categoria', 'Notas internas'];
  const rows = customers.map((customer) => [
    customer.nombre,
    customer.telefono,
    customer.email,
    customer.direccion,
    customer.ciudad,
    customer.total_pedidos,
    customer.total_gastado,
    customer.ultimo_pedido,
    customer.frecuencia_dias ?? '',
    customer.categoria,
    customer.notas_internas,
  ]);
  const csv = '\uFEFF' + [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="clientes-tiens-colombia.csv"');
  res.send(csv);
}));

router.put('/customers/:telefono/notes', [
  body('notas').isLength({ max: 2000 }).withMessage('Las notas son demasiado largas.'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) throw new ApiError(422, errors.array()[0].msg);
  const customer = customersRepo.updateNotes(req.params.telefono, req.body.notas || '');
  if (!customer) throw new ApiError(404, 'Cliente no encontrado.');
  res.json({ cliente: customer });
}));

module.exports = router;
