const fs = require('fs');
const path = require('path');
const { getDb } = require('../config/db');
const { env } = require('../config/env');
const { ApiError } = require('../utils/helpers');
const ordersRepo = require('../repositories/orders.repo');
const customersRepo = require('../repositories/customers.repo');

const ESTADOS = [
  'pendiente_verificacion',
  'pago_verificado',
  'en_proceso',
  'enviado',
  'entregado',
  'cancelado',
  'pago_rechazado',
];

const TRANSICIONES = {
  pendiente_verificacion: ['pago_verificado', 'pago_rechazado', 'cancelado'],
  pago_rechazado: ['cancelado'],
  pago_verificado: ['en_proceso', 'cancelado'],
  en_proceso: ['cancelado'],
  enviado: ['entregado'],
  entregado: [],
  cancelado: [],
};

function normalizePhone(value) {
  return String(value || '').trim().replace(/[^\d+]/g, '');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function addHistory(db, pedidoId, estadoAnterior, estadoNuevo, usuarioId, nota = null) {
  db.prepare(`
    INSERT INTO pedido_historial_estados (pedido_id, estado_anterior, estado_nuevo, usuario_id, nota)
    VALUES (?, ?, ?, ?, ?)
  `).run(pedidoId, estadoAnterior, estadoNuevo, usuarioId || null, nota);
}

function restockOrder(db, order, usuarioId, motivo) {
  const items = db.prepare('SELECT * FROM detalle_pedidos WHERE pedido_id = ?').all(order.id);
  const updateStock = db.prepare("UPDATE productos SET stock = stock + ?, updated_at = datetime('now') WHERE id = ?");
  const movement = db.prepare(`
    INSERT INTO movimientos_stock (producto_id, cantidad, tipo, motivo, pedido_id, usuario_id)
    VALUES (?, ?, 'devolucion', ?, ?, ?)
  `);
  items.forEach((item) => {
    if (!item.producto_id) return;
    updateStock.run(item.cantidad, item.producto_id);
    movement.run(item.producto_id, item.cantidad, motivo, order.id, usuarioId || null);
  });
}

function deductStock(db, order, items, usuarioId) {
  const getProduct = db.prepare('SELECT * FROM productos WHERE id = ? AND deleted_at IS NULL');
  const updateStock = db.prepare("UPDATE productos SET stock = stock - ?, updated_at = datetime('now') WHERE id = ? AND stock >= ?");
  const movement = db.prepare(`
    INSERT INTO movimientos_stock (producto_id, cantidad, tipo, motivo, pedido_id, usuario_id)
    VALUES (?, ?, 'venta', ?, ?, ?)
  `);

  const normalized = [];
  const merged = new Map();
  items.forEach((item) => {
    const productoId = Number(item.producto_id || item.id);
    const cantidad = Number(item.cantidad);
    if (!Number.isInteger(productoId) || !Number.isInteger(cantidad) || cantidad <= 0) {
      throw new ApiError(422, 'Hay un producto o una cantidad inválida en el pedido.');
    }
    if (cantidad > 50) throw new ApiError(422, 'La cantidad máxima por producto es 50 unidades.');
    merged.set(productoId, (merged.get(productoId) || 0) + cantidad);
  });

  let total = 0;
  for (const [productoId, cantidad] of merged.entries()) {
    const product = getProduct.get(productoId);
    if (!product || !product.activo) {
      throw new ApiError(409, 'Uno de los productos ya no está disponible.');
    }
    if (product.stock < cantidad) {
      throw new ApiError(409, `Stock insuficiente para "${product.nombre}". Disponible: ${product.stock}.`);
    }
    const subtotal = product.precio * cantidad;
    total += subtotal;
    normalized.push({ product, cantidad, subtotal });
  }

  if (!normalized.length) throw new ApiError(422, 'El pedido debe tener al menos un producto.');

  normalized.forEach(({ product, cantidad, subtotal }) => {
    const result = updateStock.run(cantidad, product.id, cantidad);
    if (result.changes !== 1) {
      throw new ApiError(409, `Stock insuficiente para "${product.nombre}".`);
    }
    movement.run(product.id, -cantidad, `Pedido #${order.codigo || order.id}`, order.id, usuarioId || null);
    db.prepare(`
      INSERT INTO detalle_pedidos (pedido_id, producto_id, nombre_snapshot, cantidad, precio_unitario, subtotal)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(order.id, product.id, product.nombre, cantidad, product.precio, subtotal);
  });

  return total;
}

function createOrder({ cliente, usuarioId = null, items, receiptFilename }) {
  if (!receiptFilename) throw new ApiError(422, 'El comprobante de pago es obligatorio.');
  if (!Array.isArray(items) || !items.length) throw new ApiError(422, 'El carrito está vacío.');

  const db = getDb();
  const tx = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO pedidos (usuario_id, nombre, telefono, email, ciudad, direccion, notas, total, estado, comprobante_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'pendiente_verificacion', ?)
    `).run(
      usuarioId || null,
      cliente.nombre,
      normalizePhone(cliente.telefono),
      cliente.email ? normalizeEmail(cliente.email) : null,
      cliente.ciudad,
      cliente.direccion,
      cliente.notas || null,
      receiptFilename,
    );

    const orderId = result.lastInsertRowid;
    const codigo = `TC-${String(orderId).padStart(6, '0')}`;
    db.prepare('UPDATE pedidos SET codigo = ? WHERE id = ?').run(codigo, orderId);

    const order = { id: orderId, codigo };
    const total = deductStock(db, order, items, usuarioId);
    db.prepare('UPDATE pedidos SET total = ? WHERE id = ?').run(total, orderId);
    addHistory(db, orderId, null, 'pendiente_verificacion', usuarioId, 'Pedido creado y comprobante recibido.');
    return orderId;
  });

  return ordersRepo.findById(tx());
}

function updateStatus(orderId, nuevoEstado, actor, { motivo = '' } = {}) {
  if (!ESTADOS.includes(nuevoEstado)) throw new ApiError(422, 'Estado inválido.');
  if (nuevoEstado === 'pago_rechazado' && !String(motivo).trim()) {
    throw new ApiError(422, 'Debes indicar el motivo del rechazo.');
  }

  const db = getDb();
  const tx = db.transaction(() => {
    const order = ordersRepo.findById(orderId);
    if (!order) throw new ApiError(404, 'Pedido no encontrado.');
    const permitidos = TRANSICIONES[order.estado] || [];
    if (nuevoEstado === 'enviado') {
      throw new ApiError(409, 'Para marcar el pedido como enviado debes guardar el número de guía.');
    }
    if (!permitidos.includes(nuevoEstado)) {
      throw new ApiError(409, `No se puede pasar de "${order.estado}" a "${nuevoEstado}".`);
    }
    if (nuevoEstado === 'pago_verificado' && !order.comprobante_url) {
      throw new ApiError(409, 'El pedido no tiene comprobante para verificar.');
    }

    if (nuevoEstado === 'pago_rechazado' || (nuevoEstado === 'cancelado' && order.estado !== 'pago_rechazado')) {
      const reason = nuevoEstado === 'pago_rechazado'
        ? `Pago rechazado: ${motivo}`
        : `Pedido cancelado${motivo ? `: ${motivo}` : ''}`;
      restockOrder(db, order, actor.id, reason);
    }

    const setFields = ["estado = ?", "updated_at = datetime('now')"];
    const params = [nuevoEstado];
    if (nuevoEstado === 'pago_rechazado') {
      setFields.push('motivo_rechazo = ?');
      params.push(String(motivo).trim());
    } else if (nuevoEstado !== 'cancelado') {
      setFields.push('motivo_rechazo = NULL');
    }
    params.push(orderId);
    db.prepare(`UPDATE pedidos SET ${setFields.join(', ')} WHERE id = ?`).run(...params);

    addHistory(
      db,
      orderId,
      order.estado,
      nuevoEstado,
      actor.id,
      nuevoEstado === 'pago_rechazado' ? `Motivo: ${motivo}` : motivo || null,
    );

    if (nuevoEstado === 'entregado') {
      customersRepo.upsertFromOrder(db, { ...order, estado: 'entregado' });
    }
    return ordersRepo.findById(orderId);
  });

  return tx();
}

function updateShipping(orderId, data, actor) {
  const { pedido_externo = '', numero_guia = '', transportadora = '' } = data;
  const db = getDb();
  const tx = db.transaction(() => {
    const order = ordersRepo.findById(orderId);
    if (!order) throw new ApiError(404, 'Pedido no encontrado.');
    if (!['pago_verificado', 'en_proceso', 'enviado'].includes(order.estado)) {
      throw new ApiError(409, 'El pago debe estar verificado antes de registrar datos de envío.');
    }

    db.prepare(`
      UPDATE pedidos SET pedido_externo = ?, numero_guia = ?, transportadora = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(String(pedido_externo).trim() || null, String(numero_guia).trim() || null, String(transportadora).trim() || null, orderId);

    let currentState = order.estado;
    if (order.estado === 'en_proceso' && String(numero_guia).trim()) {
      db.prepare("UPDATE pedidos SET estado = 'enviado', updated_at = datetime('now') WHERE id = ?").run(orderId);
      addHistory(db, orderId, 'en_proceso', 'enviado', actor.id, `Guía ${String(numero_guia).trim()}${transportadora ? ` · ${transportadora}` : ''}`);
      currentState = 'enviado';
    }

    return { order: ordersRepo.findById(orderId), estadoAnterior: currentState };
  });

  return tx().order;
}

function resubmitReceipt(orderId, { codigo, telefono, receiptFilename, usuarioId = null }) {
  if (!receiptFilename) throw new ApiError(422, 'Debes adjuntar un comprobante.');
  const db = getDb();
  let oldReceipt = null;

  const tx = db.transaction(() => {
    const order = ordersRepo.findById(orderId);
    if (!order) throw new ApiError(404, 'Pedido no encontrado.');

    const ownsAsUser = usuarioId && order.usuario_id === usuarioId;
    const phoneMatches = codigo && telefono
      && order.codigo.toUpperCase() === String(codigo).trim().toUpperCase()
      && order.telefono === normalizePhone(telefono);
    if (!ownsAsUser && !phoneMatches) throw new ApiError(403, 'No puedes modificar este pedido.');

    if (order.estado !== 'pago_rechazado') {
      throw new ApiError(409, 'Solo puedes subir un nuevo comprobante cuando el pago fue rechazado.');
    }

    const tempOrder = { ...order, estado: 'pendiente_verificacion' };
    const temporary = { id: order.id, codigo: order.codigo };
    // Se vuelve a descontar el stock que fue devuelto al rechazar el comprobante.
    db.prepare('DELETE FROM detalle_pedidos WHERE pedido_id = ?').run(order.id);
    const total = deductStock(db, temporary, order.items, usuarioId);
    if (total !== order.total) {
      throw new ApiError(409, 'Los precios cambiaron. Contacta al negocio para revisar tu pedido.');
    }

    oldReceipt = order.comprobante_url;
    db.prepare(`
      UPDATE pedidos SET comprobante_url = ?, estado = 'pendiente_verificacion', motivo_rechazo = NULL, total = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(receiptFilename, total, order.id);
    addHistory(db, order.id, 'pago_rechazado', 'pendiente_verificacion', usuarioId, 'Nuevo comprobante recibido por el cliente.');
    return order.id;
  });

  const id = tx();
  if (oldReceipt && oldReceipt !== receiptFilename) {
    const oldPath = path.join(env.receiptsDir, oldReceipt);
    try { if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath); } catch (_) { /* noop */ }
  }
  return ordersRepo.findById(id);
}

module.exports = {
  ESTADOS,
  TRANSICIONES,
  normalizePhone,
  createOrder,
  updateStatus,
  updateShipping,
  resubmitReceipt,
};
