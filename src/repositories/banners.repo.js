const { getDb } = require('../config/db');

function listPublic() {
  return getDb().prepare('SELECT * FROM banners WHERE activo = 1 ORDER BY orden ASC, id ASC').all();
}

function listAll() {
  return getDb().prepare('SELECT * FROM banners ORDER BY orden ASC, id ASC').all();
}

function findById(id) {
  return getDb().prepare('SELECT * FROM banners WHERE id = ?').get(id);
}

function create({ titulo, imagen_url, enlace, activo }) {
  const max = getDb().prepare('SELECT COALESCE(MAX(orden), 0) AS max FROM banners').get().max;
  const result = getDb().prepare(`
    INSERT INTO banners (titulo, imagen_url, enlace, activo, orden) VALUES (?, ?, ?, ?, ?)
  `).run(titulo, imagen_url, enlace || null, activo ? 1 : 0, max + 1);
  return findById(result.lastInsertRowid);
}

function update(id, { titulo, imagen_url, enlace, activo }) {
  getDb().prepare(`
    UPDATE banners SET titulo = ?, imagen_url = ?, enlace = ?, activo = ? WHERE id = ?
  `).run(titulo, imagen_url, enlace || null, activo ? 1 : 0, id);
  return findById(id);
}

function remove(id) {
  getDb().prepare('DELETE FROM banners WHERE id = ?').run(id);
}

function reorder(ids) {
  const db = getDb();
  const stmt = db.prepare('UPDATE banners SET orden = ? WHERE id = ?');
  const tx = db.transaction(() => ids.forEach((id, index) => stmt.run(index + 1, id)));
  tx();
  return listAll();
}

module.exports = { listPublic, listAll, findById, create, update, remove, reorder };
