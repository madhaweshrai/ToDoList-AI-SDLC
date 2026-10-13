const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { rootDir } = require('./config');

const schemaPath = path.join(rootDir, 'db', 'schema.sql');

function applySchema(db) {
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
}

function openDatabase(filename) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  return db;
}

module.exports = { openDatabase, applySchema };
