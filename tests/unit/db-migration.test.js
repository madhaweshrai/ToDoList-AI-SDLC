const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const {
  BACKUP_SUFFIX,
  hasIntegerIds,
  backupDatabase,
  migrateIntegerIdsToUuid,
} = require('../../backend/src/dbMigrations');
const { UUID_V4_RE } = require('../../backend/src/validation');
const { openDatabase } = require('../../backend/src/db');
const { createTodoRepository } = require('../../backend/src/repositories/todoRepository');

const LEGACY_SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'schema-integer-ids.sql'), 'utf8');

// The target TEXT-id shape, injected so these module tests do not depend on the real db/schema.sql.
const TEXT_ID_SCHEMA = `
CREATE TABLE IF NOT EXISTS todos (
    id         TEXT    PRIMARY KEY NOT NULL
               CHECK (length(id) = 36 AND id = lower(id)),
    title      TEXT    NOT NULL
               CHECK (length(title) BETWEEN 1 AND 200 AND title = trim(title)),
    completed  INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
    priority   TEXT    NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    due_date   TEXT,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_todos_completed  ON todos (completed);
CREATE INDEX IF NOT EXISTS idx_todos_priority   ON todos (priority);
CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos (created_at);
`;
const createTextSchema = (db) => db.exec(TEXT_ID_SCHEMA);

// Id gaps, two equal created_at values and one later one, so ordering by created_at needs the rowid tie-break.
const LEGACY_ROWS = [
  { id: 1, title: 'First', completed: 0, priority: 'low', due_date: null, created_at: '2030-01-01T00:00:00.000Z', updated_at: '2030-01-01T00:00:00.000Z' },
  { id: 3, title: 'Second', completed: 1, priority: 'high', due_date: '2030-02-02', created_at: '2030-01-02T00:00:00.000Z', updated_at: '2030-01-05T00:00:00.000Z' },
  { id: 7, title: 'Third', completed: 0, priority: 'medium', due_date: null, created_at: '2030-01-02T00:00:00.000Z', updated_at: '2030-01-02T00:00:00.000Z' },
  { id: 12, title: 'Fourth', completed: 0, priority: 'medium', due_date: '2031-12-31', created_at: '2030-01-03T00:00:00.000Z', updated_at: '2030-01-03T00:00:00.000Z' },
];
const withoutId = ({ id, ...rest }) => rest;

let dir;
let file;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todolist-migration-'));
  file = path.join(dir, 'todos.db');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function createLegacyDatabase(target = file, rows = LEGACY_ROWS) {
  const db = new Database(target);
  db.pragma('journal_mode = WAL');
  db.exec(LEGACY_SCHEMA);
  const insert = db.prepare(
    `INSERT INTO todos (id, title, completed, priority, due_date, created_at, updated_at)
     VALUES (@id, @title, @completed, @priority, @due_date, @created_at, @updated_at)`,
  );
  rows.forEach((row) => insert.run(row));
  db.close();
}

function withDatabase(target, fn, options) {
  const db = new Database(target, options);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

const readRows = (db) => db.prepare('SELECT * FROM todos ORDER BY created_at ASC, rowid ASC').all();
const tableNames = (db) =>
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((t) => t.name);

describe('hasIntegerIds', () => {
  it('is true for the legacy schema, false for a fresh or TEXT-id database', () => {
    createLegacyDatabase();
    withDatabase(file, (db) => expect(hasIntegerIds(db)).toBe(true));
    withDatabase(':memory:', (db) => expect(hasIntegerIds(db)).toBe(false));
    withDatabase(':memory:', (db) => {
      createTextSchema(db);
      expect(hasIntegerIds(db)).toBe(false);
    });
  });
});

describe('migrateIntegerIdsToUuid', () => {
  it('FR-5: converts every id to a v4 UUID and keeps all other columns and the order', () => {
    createLegacyDatabase();
    withDatabase(file, (db) => {
      expect(migrateIntegerIdsToUuid(db, { createSchema: createTextSchema })).toBe(LEGACY_ROWS.length);

      expect(hasIntegerIds(db)).toBe(false);
      const rows = readRows(db);
      rows.forEach((row) => expect(row.id).toMatch(UUID_V4_RE));
      expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
      expect(rows.map(withoutId)).toEqual(LEGACY_ROWS.map(withoutId));
      expect(tableNames(db)).not.toContain('todos_int_legacy');
    });
  });

  it('FR-4: a second call on an already-migrated database returns 0 and leaves ids unchanged', () => {
    createLegacyDatabase();
    withDatabase(file, (db) => {
      migrateIntegerIdsToUuid(db, { createSchema: createTextSchema });
      const before = readRows(db);
      const createSchema = jest.fn();
      expect(migrateIntegerIdsToUuid(db, { createSchema })).toBe(0);
      expect(createSchema).not.toHaveBeenCalled();
      expect(readRows(db)).toEqual(before);
    });
  });

  it('migrates an empty legacy table and reports 0 copied rows', () => {
    createLegacyDatabase(file, []);
    withDatabase(file, (db) => {
      expect(migrateIntegerIdsToUuid(db, { createSchema: createTextSchema })).toBe(0);
      expect(hasIntegerIds(db)).toBe(false);
    });
  });

  it('EH-8: a failing insert rolls everything back and leaves the INTEGER table intact', () => {
    createLegacyDatabase();
    withDatabase(file, (db) => {
      expect(() => migrateIntegerIdsToUuid(db, { newId: () => 'bad', createSchema: createTextSchema })).toThrow();
    });
    withDatabase(file, (db) => {
      expect(hasIntegerIds(db)).toBe(true);
      expect(tableNames(db)).not.toContain('todos_int_legacy');
      expect(db.prepare('SELECT * FROM todos ORDER BY id').all()).toEqual(LEGACY_ROWS);
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'todos'").all();
      expect(indexes.map((i) => i.name).sort()).toEqual(['idx_todos_completed', 'idx_todos_priority']);
    });
  });
});

describe('backupDatabase', () => {
  const target = () => `${file}${BACKUP_SUFFIX}`;

  it('EH-10: writes a readable backup with the original INTEGER ids and leaves no .tmp file', () => {
    createLegacyDatabase();
    withDatabase(file, (db) => expect(backupDatabase(db, file)).toBe(target()));

    expect(fs.existsSync(`${target()}.tmp`)).toBe(false);
    withDatabase(target(), (copy) => {
      expect(hasIntegerIds(copy)).toBe(true);
      expect(copy.prepare('SELECT * FROM todos ORDER BY id').all()).toEqual(LEGACY_ROWS);
    }, { readonly: true });
  });

  it.each([':memory:', ''])('EH-10: skips the backup for the temporary database %p', (filename) => {
    withDatabase(':memory:', (db) => {
      const vacuumInto = jest.fn();
      expect(backupDatabase(db, filename, { vacuumInto })).toBeNull();
      expect(vacuumInto).not.toHaveBeenCalled();
    });
  });

  it('N-1: replaces an existing backup with a verified fresh copy and clears a stale .tmp', () => {
    createLegacyDatabase(target(), [LEGACY_ROWS[0]]);
    fs.writeFileSync(`${target()}.tmp`, 'stale partial copy');
    createLegacyDatabase();

    withDatabase(file, (db) => expect(backupDatabase(db, file)).toBe(target()));

    expect(fs.existsSync(`${target()}.tmp`)).toBe(false);
    expect(fs.readdirSync(dir).filter((name) => name.includes('.bak'))).toEqual([path.basename(target())]);
    withDatabase(target(), (copy) => {
      expect(copy.prepare('SELECT COUNT(*) AS n FROM todos').get().n).toBe(LEGACY_ROWS.length);
    }, { readonly: true });
  });

  it('N-1: takes no backup when the copy no longer has INTEGER ids (already migrated)', () => {
    withDatabase(file, (db) => {
      createTextSchema(db);
      expect(backupDatabase(db, file)).toBeNull();
    });
    expect(fs.existsSync(target())).toBe(false);
    expect(fs.existsSync(`${target()}.tmp`)).toBe(false);
  });

  it('EH-10: a failed copy throws naming the backup path and removes the partial file', () => {
    createLegacyDatabase();
    const vacuumInto = (_db, tmp) => {
      fs.writeFileSync(tmp, 'partial');
      throw new Error('disk full');
    };
    withDatabase(file, (db) => {
      expect(() => backupDatabase(db, file, { vacuumInto })).toThrow(
        `Backup to ${target()} failed: disk full; database not migrated`,
      );
    });
    expect(fs.existsSync(target())).toBe(false);
    expect(fs.existsSync(`${target()}.tmp`)).toBe(false);
  });

  it('EH-10: a stale .tmp that cannot be cleared is reported as a failed backup naming the path', () => {
    createLegacyDatabase();
    fs.mkdirSync(`${target()}.tmp`);
    fs.writeFileSync(path.join(`${target()}.tmp`, 'blocker'), 'x');
    const vacuumInto = jest.fn();
    withDatabase(file, (db) => {
      expect(() => backupDatabase(db, file, { vacuumInto })).toThrow(
        new RegExp(`^Backup to .*${path.basename(target())} failed: .*; database not migrated$`),
      );
    });
    expect(vacuumInto).not.toHaveBeenCalled();
    expect(fs.existsSync(target())).toBe(false);
  });

  it('EH-10: an unreadable copy is treated as a failed backup', () => {
    createLegacyDatabase();
    const vacuumInto = (_db, tmp) => fs.writeFileSync(tmp, 'not a sqlite database');
    withDatabase(file, (db) => {
      expect(() => backupDatabase(db, file, { vacuumInto })).toThrow(/database not migrated/);
    });
    expect(fs.existsSync(target())).toBe(false);
    expect(fs.existsSync(`${target()}.tmp`)).toBe(false);
  });
});

describe('openDatabase upgrade (real db/schema.sql)', () => {
  const backupPath = () => `${file}${BACKUP_SUFFIX}`;
  const bakFiles = () => fs.readdirSync(dir).filter((name) => name.includes('.bak'));

  function openAndClose(options) {
    const db = openDatabase(file, options);
    try {
      return { rows: readRows(db) };
    } finally {
      db.close();
    }
  }

  it('AC-6: converts a legacy database to UUID ids, keeping every column, the order and the indexes', () => {
    createLegacyDatabase();
    const log = jest.fn();

    const db = openDatabase(file, { log });
    try {
      const idColumn = db.prepare("PRAGMA table_info('todos')").all().find((c) => c.name === 'id');
      expect(idColumn.type).toBe('TEXT');

      const todos = createTodoRepository(db).findAll();
      todos.forEach((todo) => expect(todo.id).toMatch(UUID_V4_RE));
      expect(todos.map((t) => t.title)).toEqual(LEGACY_ROWS.map((r) => r.title));
      expect(readRows(db).map(withoutId)).toEqual(LEGACY_ROWS.map(withoutId));

      const indexes = db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'todos' AND sql IS NOT NULL")
        .all()
        .map((i) => i.name)
        .sort();
      expect(indexes).toEqual(['idx_todos_completed', 'idx_todos_created_at', 'idx_todos_priority']);
      expect(tableNames(db)).not.toContain('todos_int_legacy');
    } finally {
      db.close();
    }

    expect(log).toHaveBeenCalledWith(`Backed up database to ${backupPath()}`);
    expect(log).toHaveBeenCalledWith(`Migrated ${LEGACY_ROWS.length} todo(s) to UUID ids`);
  });

  it('AC-6 / FR-4: reopening an already-migrated database changes nothing and logs nothing', () => {
    createLegacyDatabase();
    const first = openAndClose();
    const log = jest.fn();
    const vacuumInto = jest.fn();

    const second = openAndClose({ log, vacuumInto });

    expect(second.rows).toEqual(first.rows);
    expect(log).not.toHaveBeenCalled();
    expect(vacuumInto).not.toHaveBeenCalled();
  });

  it('AC-11: a successful upgrade leaves a readable .pre-68130.bak with the original INTEGER ids', () => {
    createLegacyDatabase();
    openAndClose();

    expect(bakFiles()).toEqual([path.basename(backupPath())]);
    withDatabase(backupPath(), (copy) => {
      expect(hasIntegerIds(copy)).toBe(true);
      expect(copy.prepare('SELECT * FROM todos ORDER BY id').all()).toEqual(LEGACY_ROWS);
    }, { readonly: true });
  });

  it('AC-11 / N-1: a retry after a failed migration replaces the backup with a verified fresh copy', () => {
    createLegacyDatabase(backupPath(), [LEGACY_ROWS[0]]); // stale backup from an earlier attempt
    createLegacyDatabase();

    expect(() => openDatabase(file, { newId: () => 'bad' })).toThrow(/^Database setup failed: /);
    openAndClose();

    expect(bakFiles()).toEqual([path.basename(backupPath())]);
    withDatabase(backupPath(), (copy) => {
      expect(copy.prepare('SELECT * FROM todos ORDER BY id').all()).toEqual(LEGACY_ROWS);
    }, { readonly: true });
  });

  it('AC-11 / EH-10: a failed backup aborts startup with the backup path and leaves the database unchanged', () => {
    createLegacyDatabase();
    const vacuumInto = () => {
      throw new Error('disk full');
    };

    expect(() => openDatabase(file, { vacuumInto })).toThrow(
      `Database setup failed: Backup to ${backupPath()} failed: disk full; database not migrated`,
    );

    expect(bakFiles()).toEqual([]);
    withDatabase(file, (db) => {
      expect(hasIntegerIds(db)).toBe(true);
      expect(db.prepare('SELECT * FROM todos ORDER BY id').all()).toEqual(LEGACY_ROWS);
    });
  });

  it('EH-8: a migration failure closes the database, rethrows clearly and leaves the INTEGER table intact', () => {
    createLegacyDatabase();
    let caught;
    try {
      openDatabase(file, { newId: () => 'bad' });
    } catch (error) {
      caught = error;
    }
    expect(caught.message).toMatch(/^Database setup failed: /);
    expect(caught.cause).toBeInstanceOf(Error);

    withDatabase(file, (db) => {
      expect(hasIntegerIds(db)).toBe(true);
      expect(tableNames(db)).not.toContain('todos_int_legacy');
      expect(db.prepare('SELECT * FROM todos ORDER BY id').all()).toEqual(LEGACY_ROWS);
    });
  });

  it('FR-5: a fresh database is created with TEXT ids and is neither migrated nor backed up', () => {
    const log = jest.fn();
    const vacuumInto = jest.fn();
    const db = openDatabase(file, { log, vacuumInto });
    try {
      expect(hasIntegerIds(db)).toBe(false);
      expect(tableNames(db)).toContain('todos');
    } finally {
      db.close();
    }
    expect(log).not.toHaveBeenCalled();
    expect(vacuumInto).not.toHaveBeenCalled();
    expect(bakFiles()).toEqual([]);
  });
});
