const { getDb } = require('../config/db');

const PUBLIC_FIELDS = 'id, nombre, email, rol, telefono, direccion, ciudad, created_at';

function findByEmail(email) {
  return getDb().prepare('SELECT * FROM usuarios WHERE lower(email) = lower(?)').get(email);
}

function findById(id) {
  return getDb().prepare(`SELECT ${PUBLIC_FIELDS} FROM usuarios WHERE id = ?`).get(id);
}

function findByIdWithPassword(id) {
  return getDb().prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
}

function create({ nombre, email, passwordHash, rol = 'cliente', telefono = null, direccion = null, ciudad = null }) {
  const result = getDb().prepare(`
    INSERT INTO usuarios (nombre, email, password_hash, rol, telefono, direccion, ciudad)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(nombre, email.toLowerCase(), passwordHash, rol, telefono, direccion, ciudad);
  return findById(result.lastInsertRowid);
}

function updateProfile(id, { nombre, telefono, direccion, ciudad }) {
  getDb().prepare(`
    UPDATE usuarios SET nombre = ?, telefono = ?, direccion = ?, ciudad = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(nombre, telefono || null, direccion || null, ciudad || null, id);
  return findById(id);
}

function upsertSeedUser({ nombre, email, passwordHash, rol }) {
  const existing = findByEmail(email);
  if (existing) {
    getDb().prepare(`
      UPDATE usuarios SET nombre = ?, password_hash = ?, rol = ?, updated_at = datetime('now') WHERE id = ?
    `).run(nombre, passwordHash, rol, existing.id);
    return findById(existing.id);
  }
  return create({ nombre, email, passwordHash, rol });
}

module.exports = { findByEmail, findById, findByIdWithPassword, create, updateProfile, upsertSeedUser };
