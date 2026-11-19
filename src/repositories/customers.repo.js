const { getDb } = require('../config/db');

function upsertFromOrder(db, order) {
  if (!order.telefono) return null;
  const existing = db.prepare('SELECT * FROM clientes WHERE telefono = ?').get(order.telefono);
  if (existing) {
    db.prepare(`
      UPDATE clientes
      SET usuario_id = COALESCE(?, usuario_id), nombre = ?, email = COALESCE(?, email),
          direccion = COALESCE(?, direccion), ciudad = COALESCE(?, ciudad), updated_at = datetime('now')
      WHERE id = ?
    `).run(order.usuario_id || null, order.nombre, order.email || null, order.direccion || null, order.ciudad || null, existing.id);
    return existing.id;
  }
  const result = db.prepare(`
    INSERT INTO clientes (usuario_id, nombre, telefono, email, direccion, ciudad)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(order.usuario_id || null, order.nombre, order.telefono, order.email || null, order.direccion || null, order.ciudad || null);
  return result.lastInsertRowid;
}

function buildCustomers() {
  const db = getDb();
  const orders = db.prepare(`
    SELECT * FROM pedidos WHERE estado = 'entregado' ORDER BY created_at DESC, id DESC
  `).all();
  const clients = db.prepare('SELECT * FROM clientes').all();
  const clientsByPhone = new Map(clients.map((client) => [client.telefono, client]));
  const grouped = new Map();

  orders.forEach((order) => {
    if (!grouped.has(order.telefono)) grouped.set(order.telefono, []);
    grouped.get(order.telefono).push(order);
  });

  const now = Date.now();
  const customers = [];
  grouped.forEach((customerOrders, telefono) => {
    const latest = customerOrders[0];
    const first = customerOrders[customerOrders.length - 1];
    const totalGastado = customerOrders.reduce((sum, order) => sum + order.total, 0);
    const daysSinceLast = Math.floor((now - new Date(`${latest.created_at}Z`).getTime()) / 86400000);
    const daysSinceFirst = Math.floor((now - new Date(`${first.created_at}Z`).getTime()) / 86400000);
    const times = customerOrders.map((order) => new Date(`${order.created_at}Z`).getTime()).sort((a, b) => a - b);
    const intervals = times.slice(1).map((time, index) => (time - times[index]) / 86400000);
    const frecuencyDays = intervals.length ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length) : null;
    const internal = clientsByPhone.get(telefono);

    let categoria = 'regular';
    if (customerOrders.length >= 3) categoria = 'frecuente';
    if (daysSinceLast > 90) categoria = 'inactivo';
    if (daysSinceFirst <= 30) categoria = 'nuevo';

    customers.push({
      id: internal ? internal.id : null,
      usuario_id: latest.usuario_id,
      registrado: Boolean(latest.usuario_id),
      nombre: latest.nombre,
      telefono,
      email: latest.email || internal?.email || '',
      direccion: latest.direccion,
      ciudad: latest.ciudad,
      notas_internas: internal?.notas_internas || '',
      total_pedidos: customerOrders.length,
      total_gastado: totalGastado,
      ultimo_pedido: latest.created_at,
      primer_pedido: first.created_at,
      dias_sin_comprar: daysSinceLast,
      frecuencia_dias: frecuencyDays,
      categoria,
      historial: customerOrders.map((order) => ({
        id: order.id,
        codigo: order.codigo,
        fecha: order.created_at,
        total: order.total,
      })),
    });
  });

  return customers.sort((a, b) => new Date(b.ultimo_pedido) - new Date(a.ultimo_pedido));
}

function list({ q = '', filtro = '' } = {}) {
  let customers = buildCustomers();
  const term = String(q).trim().toLowerCase();
  if (term) {
    customers = customers.filter((customer) => [customer.nombre, customer.telefono, customer.email]
      .some((value) => String(value || '').toLowerCase().includes(term)));
  }
  if (filtro) customers = customers.filter((customer) => customer.categoria === filtro);
  return customers;
}

function updateNotes(telefono, notas) {
  const db = getDb();
  const customer = list({ q: telefono }).find((item) => item.telefono === telefono);
  if (!customer) return null;
  if (customer.id) {
    db.prepare("UPDATE clientes SET notas_internas = ?, updated_at = datetime('now') WHERE id = ?").run(notas, customer.id);
  } else {
    db.prepare(`
      INSERT INTO clientes (usuario_id, nombre, telefono, email, direccion, ciudad, notas_internas)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(customer.usuario_id || null, customer.nombre, customer.telefono, customer.email || null, customer.direccion, customer.ciudad, notas);
  }
  return list({ q: telefono }).find((item) => item.telefono === telefono);
}

module.exports = { upsertFromOrder, list, updateNotes, buildCustomers };
