const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { rootDir } = require('./config');
const { hasIntegerIds, backupDatabase, migrateIntegerIdsToUuid } = require('./dbMigrations');

const schemaPath = path.join(rootDir, 'db', 'schema.sql');

function applySchema(db) {
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
}

/** Backs up and converts a pre-68130 INTEGER-id database. A no-op for fresh or already-migrated databases. */
function upgradeLegacyIds(db, filename, { newId, log, vacuumInto }) {
  if (!hasIntegerIds(db)) return;

  const backup = backupDatabase(db, filename, { vacuumInto });
  if (backup) log(`Backed up database to ${backup}`);

  const migrated = migrateIntegerIdsToUuid(db, { newId, createSchema: applySchema });
  if (migrated > 0) log(`Migrated ${migrated} todo(s) to UUID ids`);
}

function openDatabase(filename, { newId, log = () => {}, vacuumInto } = {}) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }
  const db = new Database(filename);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    upgradeLegacyIds(db, filename, { newId, log, vacuumInto });
    applySchema(db);
  } catch (err) {
    db.close();
    throw new Error(`Database setup failed: ${err.message}`, { cause: err });
  }
  return db;
}

module.exports = { openDatabase, applySchema };
