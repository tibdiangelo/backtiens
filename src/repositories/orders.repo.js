const { getDb } = require('../config/db');

const ORDER_SELECT = `
  SELECT p.*, u.email AS usuario_email
  FROM pedidos p
  LEFT JOIN usuarios u ON u.id = p.usuario_id
`;

function findById(id) {
  const db = getDb();
  const order = db.prepare(`${ORDER_SELECT} WHERE p.id = ?`).get(id);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM detalle_pedidos WHERE pedido_id = ? ORDER BY id').all(id);
  order.historial = db.prepare(`
    SELECT h.*, u.nombre AS usuario_nombre
    FROM pedido_historial_estados h
    LEFT JOIN usuarios u ON u.id = h.usuario_id
    WHERE h.pedido_id = ?
    ORDER BY h.fecha ASC, h.id ASC
  `).all(id);
  return order;
}

function findByCodigo(codigo) {
  return getDb().prepare(`${ORDER_SELECT} WHERE upper(p.codigo) = upper(?)`).get(codigo);
}

function findByTracking(codigo, telefono) {
  return getDb().prepare(`${ORDER_SELECT} WHERE upper(p.codigo) = upper(?) AND p.telefono = ?`).get(codigo, telefono);
}

function listByUser(usuarioId) {
  const db = getDb();
  const orders = db.prepare(`${ORDER_SELECT} WHERE p.usuario_id = ? ORDER BY p.created_at DESC, p.id DESC`).all(usuarioId);
  const itemStmt = db.prepare('SELECT * FROM detalle_pedidos WHERE pedido_id = ? ORDER BY id');
  return orders.map((order) => ({ ...order, items: itemStmt.all(order.id) }));
}

function listAdmin({ estado = '', q = '', orden = 'desc' } = {}) {
  const conditions = [];
  const params = [];
  if (estado) {
    conditions.push('p.estado = ?');
    params.push(estado);
  }
  if (q) {
    conditions.push('(upper(p.codigo) LIKE upper(?) OR lower(p.nombre) LIKE lower(?) OR p.telefono LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const direction = String(orden).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return getDb().prepare(`
    ${ORDER_SELECT}
    ${where}
    ORDER BY p.created_at ${direction}, p.id ${direction}
  `).all(...params);
}

function receiptFilename(id) {
  const row = getDb().prepare('SELECT comprobante_url FROM pedidos WHERE id = ?').get(id);
  return row ? row.comprobante_url : null;
}

function deliveredOrders() {
  return getDb().prepare(`
    SELECT p.* FROM pedidos p
    WHERE p.estado = 'entregado'
    ORDER BY p.created_at DESC, p.id DESC
  `).all();
}

function countByState() {
  return getDb().prepare('SELECT estado, COUNT(*) AS total FROM pedidos GROUP BY estado').all();
}

module.exports = {
  findById, findByCodigo, findByTracking, listByUser, listAdmin,
  receiptFilename, deliveredOrders, countByState,
};
