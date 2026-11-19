const express = require('express');
const { body, validationResult } = require('express-validator');
const settingsRepo = require('../../repositories/settings.repo');
const { verifyToken, verifyRole } = require('../../middleware/auth');
const { asyncHandler, ApiError } = require('../../utils/helpers');

const router = express.Router();
router.use(verifyToken, verifyRole('admin'));

router.get('/settings', asyncHandler(async (req, res) => {
  res.json({ configuracion: settingsRepo.getAll() });
}));

router.put('/settings', [
  body('business_name').trim().isLength({ min: 2, max: 100 }).withMessage('El nombre del negocio es obligatorio.'),
  body('business_whatsapp').trim().isLength({ min: 7, max: 20 }).withMessage('Ingresa un WhatsApp válido.'),
  body('low_stock_threshold').isInt({ min: 0, max: 10000 }).withMessage('El umbral debe ser un número entero.'),
  body('payment_holder').trim().isLength({ min: 2, max: 120 }).withMessage('Ingresa el titular de la cuenta.'),
  body('payment_bank').trim().isLength({ min: 2, max: 80 }),
  body('account_number').trim().isLength({ min: 4, max: 50 }).withMessage('Ingresa el número de cuenta.'),
  body('account_type').trim().isLength({ min: 2, max: 40 }),
  body('bre_b_key').trim().isLength({ min: 3, max: 100 }).withMessage('Ingresa la llave Bre-B.'),
  body('payment_instructions').optional({ checkFalsy: true }).trim().isLength({ max: 1000 }),
  body('business_city').optional({ checkFalsy: true }).trim().isLength({ max: 100 }),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ApiError(422, errors.array()[0].msg);
  }
  const config = settingsRepo.update({
    business_name: req.body.business_name,
    business_whatsapp: req.body.business_whatsapp,
    low_stock_threshold: req.body.low_stock_threshold,
    payment_holder: req.body.payment_holder,
    payment_bank: req.body.payment_bank,
    account_number: req.body.account_number,
    account_type: req.body.account_type,
    bre_b_key: req.body.bre_b_key,
    payment_instructions: req.body.payment_instructions || '',
    business_city: req.body.business_city || '',
  });
  res.json({ configuracion: config });
}));

module.exports = router;
