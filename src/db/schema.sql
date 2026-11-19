PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  rol TEXT NOT NULL DEFAULT 'cliente' CHECK (rol IN ('cliente', 'admin', 'operador')),
  telefono TEXT,
  direccion TEXT,
  ciudad TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categorias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS productos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT NOT NULL DEFAULT '',
  precio INTEGER NOT NULL CHECK (precio >= 0),
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS producto_imagenes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  orden INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  titulo TEXT NOT NULL,
  imagen_url TEXT NOT NULL,
  enlace TEXT,
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  orden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL,
  email TEXT,
  ciudad TEXT NOT NULL,
  direccion TEXT NOT NULL,
  notas TEXT,
  total INTEGER NOT NULL CHECK (total >= 0),
  estado TEXT NOT NULL DEFAULT 'pendiente_verificacion'
    CHECK (estado IN ('pendiente_verificacion', 'pago_verificado', 'en_proceso', 'enviado', 'entregado', 'cancelado', 'pago_rechazado')),
  comprobante_url TEXT,
  motivo_rechazo TEXT,
  pedido_externo TEXT,
  numero_guia TEXT,
  transportadora TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS detalle_pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  producto_id INTEGER REFERENCES productos(id) ON DELETE SET NULL,
  nombre_snapshot TEXT NOT NULL,
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario INTEGER NOT NULL CHECK (precio_unitario >= 0),
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0)
);

CREATE TABLE IF NOT EXISTS pedido_historial_estados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  estado_anterior TEXT,
  estado_nuevo TEXT NOT NULL,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  nota TEXT,
  fecha TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS movimientos_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  producto_id INTEGER NOT NULL REFERENCES productos(id) ON DELETE CASCADE,
  cantidad INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  motivo TEXT,
  pedido_id INTEGER REFERENCES pedidos(id) ON DELETE SET NULL,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  nombre TEXT NOT NULL,
  telefono TEXT NOT NULL UNIQUE,
  email TEXT,
  direccion TEXT,
  ciudad TEXT,
  notas_internas TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_productos_activo ON productos(activo, deleted_at);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON productos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos(estado);
CREATE INDEX IF NOT EXISTS idx_pedidos_telefono ON pedidos(telefono);
CREATE INDEX IF NOT EXISTS idx_pedidos_fecha ON pedidos(created_at);
CREATE INDEX IF NOT EXISTS idx_historial_pedido ON pedido_historial_estados(pedido_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON movimientos_stock(producto_id);
