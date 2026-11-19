require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { initializeDatabase, getDb, closeDb } = require('../config/db');
const { env, ensureAppDirectories } = require('../config/env');
const usersRepo = require('../repositories/users.repo');
const categoriesRepo = require('../repositories/categories.repo');
const productsRepo = require('../repositories/products.repo');
const bannersRepo = require('../repositories/banners.repo');
const settingsRepo = require('../repositories/settings.repo');

function escapeXml(text) {
  return String(text).replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char]));
}

function productSvg(title, category, colorA, colorB, accent = '#E4EAD9') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900" viewBox="0 0 900 900" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colorA}"/><stop offset="100%" stop-color="${colorB}"/>
    </linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="38"/></filter>
  </defs>
  <rect width="900" height="900" fill="url(#g)"/>
  <circle cx="700" cy="190" r="230" fill="${accent}" opacity="0.18" filter="url(#blur)"/>
  <circle cx="150" cy="760" r="260" fill="${accent}" opacity="0.12" filter="url(#blur)"/>
  <circle cx="450" cy="430" r="290" fill="none" stroke="${accent}" stroke-width="1.5" opacity="0.3"/>
  <circle cx="450" cy="430" r="215" fill="#ffffff" opacity="0.07"/>
  <path d="M560 300c-96 6-166 52-184 134-3 24 11 46 32 57 12-57 44-100 100-128-46 32-72 78-79 138 57 7 101-31 108-91 4-38-3-74-17-110Z" fill="${accent}" opacity="0.92"/>
  <path d="M430 550c31-83 71-126 129-161" stroke="${accent}" stroke-width="6" stroke-linecap="round" fill="none" opacity="0.6"/>
  <path d="M300 640c56-10 96-42 118-92-8 66-46 108-105 126-14 4-24-4-22-18Z" fill="${accent}" opacity="0.35"/>
  <circle cx="640" cy="600" r="7" fill="${accent}" opacity="0.75"/>
  <circle cx="680" cy="655" r="4" fill="${accent}" opacity="0.5"/>
  <circle cx="620" cy="690" r="3" fill="${accent}" opacity="0.45"/>
</svg>`;
}

function bannerSvg(title, subtitle, colorA, colorB, accent = '#E4EAD9') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 1000 1000" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colorA}"/><stop offset="100%" stop-color="${colorB}"/>
    </linearGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="30"/></filter>
  </defs>
  <rect width="1000" height="1000" fill="url(#bg)"/>
  <circle cx="790" cy="210" r="230" fill="${accent}" opacity="0.18" filter="url(#soft)"/>
  <circle cx="180" cy="820" r="260" fill="${accent}" opacity="0.12" filter="url(#soft)"/>
  <path d="M760 250c-120 8-208 66-230 168-4 30 14 58 40 72 15-72 55-126 126-161-58 40-91 98-100 173 72 9 127-39 136-114 6-48-4-93-21-138Z" fill="${accent}" opacity="0.85"/>
  <path d="M560 620c39-104 89-158 162-202" stroke="${accent}" stroke-width="7" stroke-linecap="round" fill="none" opacity="0.5"/>
  <text x="500" y="380" text-anchor="middle" font-family="DM Sans, Segoe UI, sans-serif" font-size="18" letter-spacing="7" fill="#ffffff" opacity="0.7">BIENESTAR NATURAL</text>
  <text x="500" y="474" text-anchor="middle" font-family="Cormorant Garamond, Georgia, serif" font-size="78" fill="#ffffff">${escapeXml(title)}</text>
  <text x="500" y="533" text-anchor="middle" font-family="DM Sans, Segoe UI, sans-serif" font-size="25" fill="#ffffff" opacity="0.86">${escapeXml(subtitle)}</text>
  <rect x="380" y="588" width="240" height="58" rx="29" fill="#FAF5F0" opacity="0.95"/>
  <text x="500" y="624" text-anchor="middle" font-family="DM Sans, Segoe UI, sans-serif" font-size="20" font-weight="600" fill="${colorB}">Ver productos</text>
  <text x="500" y="712" text-anchor="middle" font-family="DM Sans, Segoe UI, sans-serif" font-size="15" letter-spacing="4" fill="#ffffff" opacity="0.55">PRODUCTOS NATURALES TIENS COLOMBIA</text>
</svg>`;
}

function writeAsset(dir, filename, svg) {
  fs.writeFileSync(path.join(dir, filename), svg, 'utf8');
  return filename;
}

/* Renombra cuentas del seed con el correo anterior para no duplicar usuarios. */
function migrateSeedEmail(oldEmail, newEmail) {
  const db = getDb();
  const previous = db.prepare('SELECT id FROM usuarios WHERE lower(email) = lower(?)').get(oldEmail);
  const current = db.prepare('SELECT id FROM usuarios WHERE lower(email) = lower(?)').get(newEmail);
  if (previous && !current) {
    db.prepare("UPDATE usuarios SET email = ?, updated_at = datetime('now') WHERE id = ?").run(newEmail.toLowerCase(), previous.id);
  }
}

/* Desactiva los banners de ejemplo del diseño anterior. */
function removeLegacyBanners() {
  const db = getDb();
  db.prepare("UPDATE banners SET activo = 0 WHERE imagen_url NOT LIKE '/uploads/banners/tiens-banner%'").run();
}

/* Elimina categorías del diseño anterior que se quedaron sin productos. */
function removeLegacyCategories() {
  const legacy = ['Accesorios', 'Belleza', 'Hogar', 'Tecnología', 'Deco', 'Moda'];
  const db = getDb();
  const used = db.prepare('SELECT COUNT(*) AS total FROM productos WHERE categoria_id = ? AND deleted_at IS NULL');
  const placeholders = legacy.map(() => '?').join(',');
  db.prepare(`SELECT id FROM categorias WHERE nombre IN (${placeholders})`).all(...legacy).forEach((row) => {
    if (used.get(row.id).total === 0) {
      db.prepare('DELETE FROM categorias WHERE id = ?').run(row.id);
    }
  });
}

/* Retira los productos de ejemplo del diseño anterior si no tienen pedidos. */
function removeLegacySamples() {
  const legacy = [
    'Set de tazas artesanales', 'Manta tejida en algodón', 'Crema facial de caléndula',
    'Set de brochas profesionales', 'Lámpara de mesa nórdica', 'Audífonos inalámbricos Air Tone',
    'Organizador de escritorio', 'Bolso tejido Luna', 'Termo de acero 750 ml',
  ];
  const db = getDb();
  const placeholders = legacy.map(() => '?').join(',');
  const rows = db.prepare(`SELECT id FROM productos WHERE nombre IN (${placeholders}) AND deleted_at IS NULL`).all(...legacy);
  const orderCount = db.prepare('SELECT COUNT(*) AS total FROM detalle_pedidos WHERE producto_id = ?');
  rows.forEach((row) => {
    if (orderCount.get(row.id).total === 0) {
      db.prepare("UPDATE productos SET activo = 0, deleted_at = datetime('now') WHERE id = ?").run(row.id);
    }
  });
}

async function seed() {
  initializeDatabase();
  ensureAppDirectories();
  settingsRepo.ensureDefaults();

  const adminEmail = (process.env.SEED_ADMIN_EMAIL || 'admin@tiens.com').trim();
  const operadorEmail = (process.env.SEED_OPERADOR_EMAIL || 'operador@tiens.com').trim();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin123456';
  const operadorPassword = process.env.SEED_OPERADOR_PASSWORD || 'Operador123456';

  migrateSeedEmail('admin@tienda.com', adminEmail);
  migrateSeedEmail('operador@tienda.com', operadorEmail);

  if (adminPassword.length < 8 || operadorPassword.length < 8) {
    throw new Error('Las contraseñas del seed deben tener al menos 8 caracteres.');
  }

  usersRepo.upsertSeedUser({
    nombre: process.env.SEED_ADMIN_NOMBRE || 'Administrador',
    email: adminEmail,
    passwordHash: await bcrypt.hash(adminPassword, 10),
    rol: 'admin',
  });
  usersRepo.upsertSeedUser({
    nombre: process.env.SEED_OPERADOR_NOMBRE || 'Operador',
    email: operadorEmail,
    passwordHash: await bcrypt.hash(operadorPassword, 10),
    rol: 'operador',
  });

  removeLegacySamples();
  removeLegacyBanners();
  removeLegacyCategories();

  const categoriesData = [
    ['Suplementos', 'suplementos'],
    ['Tés e infusiones', 'tes-e-infusiones'],
    ['Control de peso', 'control-de-peso'],
    ['Cuidado personal', 'cuidado-personal'],
  ];
  const categories = {};
  categoriesData.forEach(([nombre, slug]) => {
    let category = categoriesRepo.findBySlug(slug);
    if (!category) category = categoriesRepo.create({ nombre, slug });
    categories[slug] = category;
  });

  const productsData = [
    {
      nombre: 'Calcio Tiens',
      descripcion: 'Complemento alimenticio a base de calcio de origen natural. Acompaña tu bienestar diario dentro de una alimentación equilibrada. Presentación en polvo, 10 sobres.',
      precio: 89900, stock: 18, categoria: 'suplementos',
      colorA: '#1F3D2F', colorB: '#2F5742',
    },
    {
      nombre: 'Té Antilípido Tiens',
      descripcion: 'Infusión de hierbas seleccionadas para disfrutar después de las comidas. Sabor suave y aroma herbal. Caja con 20 sobres individuales.',
      precio: 64900, stock: 24, categoria: 'tes-e-infusiones',
      colorA: '#2F5742', colorB: '#5F7A4F',
    },
    {
      nombre: 'Quitosano Tiens',
      descripcion: 'Complemento alimenticio a base de quitosano de origen marino. Pensado para acompañar una rutina activa y una alimentación balanceada. Frasco con 60 cápsulas.',
      precio: 95900, stock: 14, categoria: 'control-de-peso',
      colorA: '#5F7A4F', colorB: '#1F3D2F',
    },
    {
      nombre: 'Fibra Dietética Tiens',
      descripcion: 'Complemento alimenticio con fibra soluble e insoluble de origen vegetal. Ideal para acompañar tu consumo diario de agua y una dieta variada. 30 sobres.',
      precio: 72900, stock: 20, categoria: 'suplementos',
      colorA: '#A5532F', colorB: '#8A4324',
    },
    {
      nombre: 'Té Verde Antioxidante',
      descripcion: 'Infusión de té verde con notas cítricas. Una bebida cálida para tus pausas diarias. Caja con 25 sobres.',
      precio: 39900, stock: 30, categoria: 'tes-e-infusiones',
      colorA: '#5F7A4F', colorB: '#2F5742',
    },
    {
      nombre: 'Multivitamínico Natural Tiens',
      descripcion: 'Complemento alimenticio con vitaminas y minerales de origen natural. Apoya tu bienestar diario como parte de una alimentación completa. Frasco con 60 tabletas.',
      precio: 84900, stock: 16, categoria: 'suplementos',
      colorA: '#2F5742', colorB: '#1F3D2F',
    },
    {
      nombre: 'Colágeno Hidrolizado Tiens',
      descripcion: 'Complemento alimenticio en polvo con colágeno hidrolizado y vitamina C. Se disuelve fácilmente en agua o jugo. Presentación de 300 g.',
      precio: 119900, stock: 10, categoria: 'cuidado-personal',
      colorA: '#A5532F', colorB: '#5F7A4F',
    },
    {
      nombre: 'Jabón Artesanal de Avena',
      descripcion: 'Jabón de uso corporal elaborado con avena y aceites vegetales. Limpieza suave para la piel. Barra de 100 g.',
      precio: 25900, stock: 35, categoria: 'cuidado-personal',
      colorA: '#E8D9C0', colorB: '#A5532F',
    },
    {
      nombre: 'Infusión Digestiva Herbal',
      descripcion: 'Mezcla de hierbas aromáticas como manzanilla, hierbabuena e hinojo. Una infusión suave para acompañar tus comidas. Caja con 20 sobres.',
      precio: 34900, stock: 28, categoria: 'tes-e-infusiones',
      colorA: '#5F7A4F', colorB: '#1F3D2F',
    },
  ];

  productsData.forEach((item, index) => {
    const filename = writeAsset(
      env.productsDir,
      `tiens-${index + 1}.svg`,
      productSvg(item.nombre, categories[item.categoria].nombre, item.colorA, item.colorB),
    );
    if (productsRepo.listAdmin().some((product) => product.nombre === item.nombre)) return;
    productsRepo.create({
      nombre: item.nombre,
      descripcion: item.descripcion,
      precio: item.precio,
      stock: item.stock,
      categoria_id: categories[item.categoria].id,
      activo: 1,
      imagenUrls: [`/uploads/products/${filename}`],
    });
  });

  const bannersData = [
    ['Bienestar natural', 'Suplementos y productos Tiens para tu día a día', '#1F3D2F', '#2F5742'],
    ['Rituales de calma', 'Tés e infusiones para tus pausas', '#5F7A4F', '#1F3D2F'],
    ['Cuida tu piel', 'Cuidado personal de origen natural', '#A5532F', '#8A4324'],
  ];

  const existingBanners = bannersRepo.listAll();
  bannersData.forEach(([titulo, subtitle, colorA, colorB], index) => {
    const filename = writeAsset(
      env.bannersDir,
      `tiens-banner-${index + 1}.svg`,
      bannerSvg(titulo, subtitle, colorA, colorB),
    );
    const existing = existingBanners.find((banner) => banner.titulo === titulo);
    if (existing) {
      if (!existing.activo) getDb().prepare('UPDATE banners SET activo = 1 WHERE id = ?').run(existing.id);
      return;
    }
    bannersRepo.create({
      titulo,
      imagen_url: `/uploads/banners/${filename}`,
      enlace: '/productos',
      activo: 1,
    });
  });

  settingsRepo.update({
    business_name: 'Productos Naturales Tiens Colombia',
    business_whatsapp: process.env.BUSINESS_WHATSAPP || '573001234567',
    low_stock_threshold: '5',
    payment_holder: 'Productos Naturales Tiens Colombia',
    payment_bank: 'Bancolombia',
    account_number: '123-456789-01',
    account_type: 'Ahorros',
    bre_b_key: '3001234567',
    business_city: 'Bogotá, Colombia',
    payment_instructions: 'Transfiere el valor exacto del pedido y adjunta la imagen del comprobante. Verificamos pagos de lunes a sábado, de 8:00 a.m. a 6:00 p.m. Una vez confirmado, preparamos tu pedido. Complemento alimenticio: no es un medicamento, consulta a tu médico.',
  });

  console.log('✔ Datos iniciales creados/actualizados.');
  console.log(`  Admin:    ${adminEmail} / ${adminPassword}`);
  console.log(`  Operador: ${operadorEmail} / ${operadorPassword}`);
  console.log('  Catálogo: 9 productos naturales Tiens y 3 banners.');
  closeDb();
}

seed().catch((error) => {
  console.error('✖ Error en el seed:', error);
  closeDb();
  process.exitCode = 1;
});
