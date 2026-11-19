const { getDb } = require('../config/db');

function attachImages(products) {
  if (!products.length) return products;
  const db = getDb();
  const placeholders = products.map(() => '?').join(',');
  const images = db.prepare(`
    SELECT * FROM producto_imagenes WHERE producto_id IN (${placeholders}) ORDER BY orden ASC, id ASC
  `).all(...products.map((p) => p.id));
  const grouped = images.reduce((acc, image) => {
    (acc[image.producto_id] ||= []).push(image);
    return acc;
  }, {});
  return products.map((product) => ({ ...product, imagenes: grouped[product.id] || [] }));
}

const BASE_SELECT = `
  SELECT p.*, c.nombre AS categoria_nombre, c.slug AS categoria_slug
  FROM productos p
  LEFT JOIN categorias c ON c.id = p.categoria_id
`;

function listPublic({ q = '', categoria = '' } = {}) {
  const conditions = ['p.activo = 1', 'p.deleted_at IS NULL'];
  const params = [];
  if (q) {
    conditions.push('lower(p.nombre) LIKE lower(?)');
    params.push(`%${q}%`);
  }
  if (categoria) {
    conditions.push('c.slug = ?');
    params.push(categoria);
  }
  const rows = getDb().prepare(`${BASE_SELECT} WHERE ${conditions.join(' AND ')} ORDER BY p.created_at DESC, p.id DESC`).all(...params);
  return attachImages(rows);
}

function findPublicById(id) {
  const row = getDb().prepare(`${BASE_SELECT} WHERE p.id = ? AND p.activo = 1 AND p.deleted_at IS NULL`).get(id);
  if (!row) return null;
  const [product] = attachImages([row]);
  return product;
}

function listAdmin() {
  const rows = getDb().prepare(`${BASE_SELECT} WHERE p.deleted_at IS NULL ORDER BY p.created_at DESC, p.id DESC`).all();
  return attachImages(rows);
}

function findById(id, { includeDeleted = false } = {}) {
  const deletedClause = includeDeleted ? '' : 'AND p.deleted_at IS NULL';
  const row = getDb().prepare(`${BASE_SELECT} WHERE p.id = ? ${deletedClause}`).get(id);
  if (!row) return null;
  const [product] = attachImages([row]);
  return product;
}

function create({ nombre, descripcion, precio, stock, categoria_id, activo, imagenUrls = [] }) {
  const db = getDb();
  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id, activo)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(nombre, descripcion || '', precio, stock, categoria_id || null, activo ? 1 : 0);
    const imageStmt = db.prepare('INSERT INTO producto_imagenes (producto_id, url, orden) VALUES (?, ?, ?)');
    imagenUrls.forEach((url, index) => imageStmt.run(result.lastInsertRowid, url, index));
    if (stock > 0) {
      db.prepare(`
        INSERT INTO movimientos_stock (producto_id, cantidad, tipo, motivo) VALUES (?, ?, 'entrada', 'Stock inicial')
      `).run(result.lastInsertRowid, stock);
    }
    return result.lastInsertRowid;
  });
  return findById(tx());
}

function update(id, { nombre, descripcion, precio, stock, categoria_id, activo }, { usuarioId = null, motivo = 'Ajuste desde edición de producto' } = {}) {
  const db = getDb();
  const current = db.prepare('SELECT stock FROM productos WHERE id = ?').get(id);
  if (!current) return null;
  const tx = db.transaction(() => {
    db.prepare(`
      UPDATE productos SET nombre = ?, descripcion = ?, precio = ?, stock = ?, categoria_id = ?, activo = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(nombre, descripcion || '', precio, stock, categoria_id || null, activo ? 1 : 0, id);
    const diff = stock - current.stock;
    if (diff !== 0) {
      db.prepare(`
        INSERT INTO movimientos_stock (producto_id, cantidad, tipo, motivo, usuario_id)
        VALUES (?, ?, 'ajuste', ?, ?)
      `).run(id, diff, motivo, usuarioId);
    }
  });
  tx();
  return findById(id);
}

function addImages(productoId, urls) {
  const db = getDb();
  const max = db.prepare('SELECT COALESCE(MAX(orden), -1) AS max FROM producto_imagenes WHERE producto_id = ?').get(productoId).max;
  const stmt = db.prepare('INSERT INTO producto_imagenes (producto_id, url, orden) VALUES (?, ?, ?)');
  urls.forEach((url, index) => stmt.run(productoId, url, max + 1 + index));
  return findById(productoId);
}

function findImage(productoId, imageId) {
  return getDb().prepare('SELECT * FROM producto_imagenes WHERE id = ? AND producto_id = ?').get(imageId, productoId);
}

function removeImage(productoId, imageId) {
  getDb().prepare('DELETE FROM producto_imagenes WHERE id = ? AND producto_id = ?').run(imageId, productoId);
}

function adjustStock(productoId, newStock, usuarioId, motivo) {
  const db = getDb();
  const current = db.prepare('SELECT stock FROM productos WHERE id = ?').get(productoId);
  if (!current) return null;
  const diff = newStock - current.stock;
  const tx = db.transaction(() => {
    db.prepare('UPDATE productos SET stock = ?, updated_at = datetime(\'now\') WHERE id = ?').run(newStock, productoId);
    if (diff !== 0) {
      db.prepare(`
        INSERT INTO movimientos_stock (producto_id, cantidad, tipo, motivo, usuario_id)
        VALUES (?, ?, 'ajuste', ?, ?)
      `).run(productoId, diff, motivo || 'Ajuste manual de stock', usuarioId);
    }
  });
  tx();
  return findById(productoId);
}

function stockMovements(productoId) {
  return getDb().prepare(`
    SELECT m.*, u.nombre AS usuario_nombre
    FROM movimientos_stock m
    LEFT JOIN usuarios u ON u.id = m.usuario_id
    WHERE m.producto_id = ?
    ORDER BY m.fecha DESC, m.id DESC
    LIMIT 100
  `).all(productoId);
}

function remove(productoId, { usuarioId } = {}) {
  const db = getDb();
  const product = findById(productoId, { includeDeleted: true });
  if (!product) return null;

  const hasOrders = db.prepare('SELECT COUNT(*) AS total FROM detalle_pedidos WHERE producto_id = ?').get(productoId).total > 0;
  const hasMovements = db.prepare('SELECT COUNT(*) AS total FROM movimientos_stock WHERE producto_id = ?').get(productoId).total > 0;

  if (hasOrders || hasMovements) {
    db.prepare("UPDATE productos SET deleted_at = datetime('now'), activo = 0, updated_at = datetime('now') WHERE id = ?").run(productoId);
    return { softDeleted: true, images: product.imagenes };
  }

  db.prepare('DELETE FROM producto_imagenes WHERE producto_id = ?').run(productoId);
  db.prepare('DELETE FROM productos WHERE id = ?').run(productoId);
  return { softDeleted: false, images: product.imagenes };
}

function countLowStock(threshold) {
  return getDb().prepare(`
    SELECT COUNT(*) AS total FROM productos
    WHERE activo = 1 AND deleted_at IS NULL AND stock <= ?
  `).get(threshold).total;
}

module.exports = {
  listPublic, findPublicById, listAdmin, findById, create, update, addImages,
  findImage, removeImage, adjustStock, stockMovements, remove, countLowStock,
};
