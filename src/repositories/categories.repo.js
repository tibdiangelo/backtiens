const { getDb } = require('../config/db');

function list() {
  return getDb().prepare(`
    SELECT c.*, COUNT(p.id) AS productos_count
    FROM categorias c
    LEFT JOIN productos p ON p.categoria_id = c.id AND p.deleted_at IS NULL AND p.activo = 1
    GROUP BY c.id
    ORDER BY c.nombre COLLATE NOCASE
  `).all();
}

function findById(id) {
  return getDb().prepare('SELECT * FROM categorias WHERE id = ?').get(id);
}

function findBySlug(slug) {
  return getDb().prepare('SELECT * FROM categorias WHERE slug = ?').get(slug);
}

function create({ nombre, slug }) {
  const result = getDb().prepare('INSERT INTO categorias (nombre, slug) VALUES (?, ?)').run(nombre, slug);
  return findById(result.lastInsertRowid);
}

function update(id, { nombre, slug }) {
  getDb().prepare('UPDATE categorias SET nombre = ?, slug = ? WHERE id = ?').run(nombre, slug, id);
  return findById(id);
}

function remove(id) {
  const count = getDb().prepare('SELECT COUNT(*) AS total FROM productos WHERE categoria_id = ? AND deleted_at IS NULL').get(id).total;
  if (count > 0) return false;
  getDb().prepare('DELETE FROM categorias WHERE id = ?').run(id);
  return true;
}

module.exports = { list, findById, findBySlug, create, update, remove };
