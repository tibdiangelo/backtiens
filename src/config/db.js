const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

let db;

function ensureDirectories() {
  const dbPath = path.resolve(__dirname, '../../', process.env.DATABASE_PATH || './data/tienda.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const uploads = path.resolve(__dirname, '../../', process.env.UPLOAD_DIR || './uploads');
  const privateDir = path.resolve(__dirname, '../../', process.env.PRIVATE_DIR || './private');
  ['products', 'banners'].forEach((folder) => fs.mkdirSync(path.join(uploads, folder), { recursive: true }));
  fs.mkdirSync(path.join(privateDir, 'receipts'), { recursive: true });
}

function getDb() {
  if (!db) {
    ensureDirectories();
    const dbPath = path.resolve(__dirname, '../../', process.env.DATABASE_PATH || './data/tienda.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma('busy_timeout = 5000');
  }
  return db;
}

function initializeDatabase() {
  const database = getDb();
  const schema = fs.readFileSync(path.join(__dirname, '../db/schema.sql'), 'utf8');
  database.exec(schema);
  return database;
}

function closeDb() {
  if (db) {
    db.close();
    db = undefined;
  }
}

module.exports = { getDb, initializeDatabase, closeDb, ensureDirectories };
