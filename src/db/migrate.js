const { initializeDatabase, closeDb } = require('../config/db');

try {
  initializeDatabase();
  console.log('✔ Base de datos inicializada correctamente.');
} catch (error) {
  console.error('✖ Error al inicializar la base de datos:', error.message);
  process.exitCode = 1;
} finally {
  closeDb();
}
