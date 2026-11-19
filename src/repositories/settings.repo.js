const { getDb } = require('../config/db');
const { env } = require('../config/env');

const DEFAULTS = {
  business_name: 'Productos Naturales Tiens Colombia',
  business_whatsapp: process.env.BUSINESS_WHATSAPP || '573001234567',
  low_stock_threshold: '5',
  payment_holder: 'Productos Naturales Tiens Colombia',
  payment_bank: 'Bancolombia',
  account_number: '000-000000-00',
  account_type: 'Ahorros',
  bre_b_key: '3001234567',
  payment_instructions: 'Realiza la transferencia por el valor exacto del pedido y sube la imagen del comprobante. Verificaremos tu pago en horario hábil. Complemento alimenticio: no es un medicamento, consulta a tu médico.',
  business_city: 'Bogotá, Colombia',
};

const PUBLIC_KEYS = [
  'business_name', 'business_whatsapp', 'payment_holder', 'payment_bank',
  'account_number', 'account_type', 'bre_b_key', 'payment_instructions', 'business_city',
];

function ensureDefaults() {
  const db = getDb();
  const insert = db.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)');
  const tx = db.transaction(() => {
    Object.entries(DEFAULTS).forEach(([clave, valor]) => insert.run(clave, valor));
  });
  tx();
}

function getAll() {
  const rows = getDb().prepare('SELECT clave, valor FROM configuracion').all();
  const values = { ...DEFAULTS };
  rows.forEach((row) => { values[row.clave] = row.valor; });
  return values;
}

function getPublic() {
  const all = getAll();
  return PUBLIC_KEYS.reduce((acc, key) => {
    acc[key] = all[key];
    return acc;
  }, {});
}

const ALLOWED_KEYS = new Set(Object.keys(DEFAULTS));

function update(values) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO configuracion (clave, valor) VALUES (?, ?)
    ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor
  `);
  const tx = db.transaction(() => {
    Object.entries(values).forEach(([key, value]) => {
      if (ALLOWED_KEYS.has(key)) stmt.run(key, String(value ?? ''));
    });
  });
  tx();
  return getAll();
}

module.exports = { DEFAULTS, PUBLIC_KEYS, ensureDefaults, getAll, getPublic, update };
