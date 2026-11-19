const express = require('express');
const bcrypt = require('bcryptjs');
const { body } = require('express-validator');
const usersRepo = require('../repositories/users.repo');
const { validate } = require('../middleware/validate');
const { verifyToken, signToken } = require('../middleware/auth');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimits');
const { asyncHandler, ApiError } = require('../utils/helpers');
const { normalizePhone } = require('../services/orders.service');

const router = express.Router();

function authPayload(user) {
  return {
    token: signToken(user),
    user: {
      id: user.id,
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      telefono: user.telefono || '',
      direccion: user.direccion || '',
      ciudad: user.ciudad || '',
    },
  };
}

router.post('/register', registerLimiter, validate([
  body('nombre').trim().isLength({ min: 2, max: 100 }).withMessage('Ingresa tu nombre completo.'),
  body('email').trim().isEmail().withMessage('Ingresa un correo válido.').normalizeEmail(),
  body('password').isLength({ min: 8, max: 72 }).withMessage('La contraseña debe tener al menos 8 caracteres.'),
  body('telefono').optional({ checkFalsy: true }).isLength({ max: 30 }),
  body('direccion').optional({ checkFalsy: true }).isLength({ max: 200 }),
  body('ciudad').optional({ checkFalsy: true }).isLength({ max: 80 }),
]), asyncHandler(async (req, res) => {
  const { nombre, email, password, telefono, direccion, ciudad } = req.body;
  if (usersRepo.findByEmail(email)) throw new ApiError(409, 'Ya existe una cuenta con este correo.');

  // El rol NUNCA se toma del cuerpo: el registro público solo crea clientes.
  const user = usersRepo.create({
    nombre,
    email,
    passwordHash: await bcrypt.hash(password, 10),
    rol: 'cliente',
    telefono: telefono ? normalizePhone(telefono) : null,
    direccion: direccion || null,
    ciudad: ciudad || null,
  });
  res.status(201).json(authPayload(user));
}));

router.post('/login', loginLimiter, validate([
  body('email').trim().isEmail().withMessage('Ingresa un correo válido.'),
  body('password').notEmpty().withMessage('Ingresa tu contraseña.'),
]), asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = usersRepo.findByEmail(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new ApiError(401, 'Correo o contraseña incorrectos.');
  }
  res.json(authPayload(user));
}));

router.get('/me', verifyToken, asyncHandler(async (req, res) => {
  res.json({ user: req.user });
}));

module.exports = router;
