const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { ApiError } = require('../utils/helpers');
const usersRepo = require('../repositories/users.repo');

function readToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7);
}

function verifyToken(req, res, next) {
  const token = readToken(req);
  if (!token) return next(new ApiError(401, 'Debes iniciar sesión.'));

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = usersRepo.findById(payload.id);
    if (!user) return next(new ApiError(401, 'La sesión ya no es válida.'));
    req.user = { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, telefono: user.telefono, direccion: user.direccion, ciudad: user.ciudad };
    return next();
  } catch (error) {
    return next(new ApiError(401, 'La sesión expiró o no es válida.'));
  }
}

function optionalAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return next();
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = usersRepo.findById(payload.id);
    if (user) req.user = { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, telefono: user.telefono, direccion: user.direccion, ciudad: user.ciudad };
  } catch (_) {
    // Un token inválido en una ruta opcional se trata como invitado.
  }
  return next();
}

function verifyRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new ApiError(401, 'Debes iniciar sesión.'));
    if (!roles.includes(req.user.rol)) return next(new ApiError(403, 'No tienes permisos para realizar esta acción.'));
    return next();
  };
}

function signToken(user) {
  return jwt.sign({ id: user.id, rol: user.rol }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

module.exports = { verifyToken, optionalAuth, verifyRole, signToken };
