const fs = require('fs');
const { randomUUID } = require('node:crypto');
const Database = require('better-sqlite3');

const BACKUP_SUFFIX = '.pre-68130.bak';
const LEGACY_TABLE = 'todos_int_legacy';
const TODO_INDEXES = ['idx_todos_completed', 'idx_todos_priority', 'idx_todos_created_at'];

/** True when the todos table still uses the pre-68130 INTEGER id column. False for a fresh or migrated DB. */
function hasIntegerIds(db) {
  const idColumn = db.prepare("PRAGMA table_info('todos')").all().find((column) => column.name === 'id');
  return idColumn !== undefined && idColumn.type.toUpperCase() === 'INTEGER';
}

function isTemporaryDatabase(filename) {
  return filename === ':memory:' || filename === '';
}

function defaultVacuumInto(db, target) {
  db.prepare('VACUUM INTO ?').run(target);
}

// Best effort: the original backup error is the one worth reporting, not a cleanup failure.
function removePartialCopy(file) {
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // ignored
  }
}

function copyStillHasIntegerIds(file) {
  const copy = new Database(file, { readonly: true, fileMustExist: true });
  try {
    return hasIntegerIds(copy);
  } finally {
    copy.close();
  }
}

/**
 * Writes a verified copy of a file DB to `<filename>.pre-68130.bak` before the id migration (EH-10, N-1).
 * The copy goes to a `.tmp` file first and only replaces the backup once it is confirmed to hold integer ids,
 * so a restart loop keeps exactly one good backup. Returns the backup path, or null when no backup was taken.
 */
function backupDatabase(db, filename, { vacuumInto = defaultVacuumInto } = {}) {
  if (isTemporaryDatabase(filename)) return null;

  const target = `${filename}${BACKUP_SUFFIX}`;
  const tmp = `${target}.tmp`;

  let verified;
  try {
    // VACUUM INTO refuses a non-empty existing file, so clear a leftover from an interrupted attempt.
    fs.rmSync(tmp, { force: true });
    vacuumInto(db, tmp);
    verified = copyStillHasIntegerIds(tmp);
  } catch (err) {
    removePartialCopy(tmp);
    throw new Error(`Backup to ${target} failed: ${err.message}; database not migrated`, { cause: err });
  }

  if (!verified) {
    // Another process migrated in between: there is nothing pre-migration left to back up.
    fs.rmSync(tmp, { force: true });
    return null;
  }
  fs.renameSync(tmp, target);
  return target;
}

/**
 * Converts the legacy INTEGER-id todos table to TEXT UUID ids in one IMMEDIATE transaction (FR-4, FR-5, EH-8).
 * `createSchema(db)` must create the new todos table and its indexes. Returns the number of copied rows,
 * or 0 when the table was already migrated (possibly by a concurrent process).
 */
function migrateIntegerIdsToUuid(db, { newId = randomUUID, createSchema }) {
  const migrate = db.transaction(() => {
    if (!hasIntegerIds(db)) return 0;

    // The old indexes keep their global names after the rename and would block CREATE INDEX IF NOT EXISTS.
    TODO_INDEXES.forEach((name) => db.exec(`DROP INDEX IF EXISTS ${name}`));
    db.exec(`ALTER TABLE todos RENAME TO ${LEGACY_TABLE}`);
    createSchema(db);

    const rows = db
      .prepare(
        `SELECT id, title, completed, priority, due_date, created_at, updated_at
           FROM ${LEGACY_TABLE} ORDER BY id ASC`,
      )
      .all();
    const insert = db.prepare(
      `INSERT INTO todos (id, title, completed, priority, due_date, created_at, updated_at)
       VALUES (@id, @title, @completed, @priority, @due_date, @created_at, @updated_at)`,
    );
    rows.forEach((row) => insert.run({ ...row, id: newId() }));

    db.exec(`DROP TABLE ${LEGACY_TABLE}`);
    return rows.length;
  });
  return migrate.immediate();
}

module.exports = { BACKUP_SUFFIX, hasIntegerIds, backupDatabase, migrateIntegerIdsToUuid };
