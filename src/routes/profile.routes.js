const express = require('express');
const { body } = require('express-validator');
const usersRepo = require('../repositories/users.repo');
const { verifyToken } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { asyncHandler } = require('../utils/helpers');
const { normalizePhone } = require('../services/orders.service');

const router = express.Router();
router.use(verifyToken);

router.get('/', asyncHandler(async (req, res) => {
  const user = usersRepo.findById(req.user.id);
  res.json({ user });
}));

router.put('/', validate([
  body('nombre').trim().isLength({ min: 2, max: 100 }).withMessage('Ingresa tu nombre completo.'),
  body('telefono').optional({ checkFalsy: true }).isLength({ max: 30 }),
  body('direccion').optional({ checkFalsy: true }).isLength({ max: 200 }),
  body('ciudad').optional({ checkFalsy: true }).isLength({ max: 80 }),
]), asyncHandler(async (req, res) => {
  const user = usersRepo.updateProfile(req.user.id, {
    nombre: req.body.nombre,
    telefono: req.body.telefono ? normalizePhone(req.body.telefono) : '',
    direccion: req.body.direccion || '',
    ciudad: req.body.ciudad || '',
  });
  res.json({ user });
}));

module.exports = router;
