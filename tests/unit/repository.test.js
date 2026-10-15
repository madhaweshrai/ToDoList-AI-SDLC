const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../../backend/src/db');
const { createTodoRepository } = require('../../backend/src/repositories/todoRepository');
const { ConflictError } = require('../../backend/src/errors');
const { UUID_V4_RE } = require('../../backend/src/validation');

const NOW = '2030-01-01T00:00:00.000Z';
const LATER = '2030-01-02T00:00:00.000Z';
const base = { completed: false, priority: 'medium', dueDate: null };
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ID1 = uid(1);
const ID2 = uid(2);
const ID3 = uid(3);
const UNKNOWN_ID = uid(999);

describe('todoRepository', () => {
  let db;
  let repo;

  beforeEach(() => {
    db = openDatabase(':memory:');
    repo = createTodoRepository(db);
  });

  afterEach(() => db.close());

  it('maps rows to camelCase todos with boolean completed', () => {
    const todo = repo.create({ ...base, id: ID1, title: 'A', dueDate: '2030-02-02' }, NOW);
    expect(todo).toEqual({
      id: ID1,
      title: 'A',
      completed: false,
      priority: 'medium',
      dueDate: '2030-02-02',
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('FR-4: stores the given id unchanged and finds the todo by it', () => {
    repo.create({ ...base, id: ID2, title: 'B' }, NOW);
    expect(repo.findById(ID2)).toMatchObject({ id: ID2, title: 'B' });
    expect(repo.findById(UNKNOWN_ID)).toBeNull();
  });

  it('EH-2: a duplicate id throws ConflictError and leaves the original row unchanged', () => {
    const original = repo.create({ ...base, id: ID1, title: 'Original' }, NOW);
    let caught;
    try {
      repo.create({ ...base, id: ID1, title: 'Impostor' }, LATER);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ConflictError);
    expect(caught.status).toBe(409);
    expect(caught.message).toBe(`Todo ${ID1} already exists`);
    expect(repo.findAll()).toEqual([original]);
  });

  it('EH-2: other constraint failures are not reported as conflicts', () => {
    expect(() => repo.create({ ...base, id: ID1, title: ' padded ' }, NOW)).toThrow(
      expect.objectContaining({ code: 'SQLITE_CONSTRAINT_CHECK' }),
    );
    expect(() => repo.create({ ...base, id: ID1, title: ' padded ' }, NOW)).not.toThrow(ConflictError);
  });

  it('FR-6: findAll orders by created_at, then insertion order for ties', () => {
    repo.create({ ...base, id: ID3, title: 'late' }, LATER);
    repo.create({ ...base, id: ID2, title: 'tie-first' }, NOW);
    repo.create({ ...base, id: ID1, title: 'tie-second' }, NOW);
    expect(repo.findAll().map((t) => t.title)).toEqual(['tie-first', 'tie-second', 'late']);
  });

  it('update returns null for a missing id', () => {
    expect(repo.update(UNKNOWN_ID, { ...base, title: 'x' }, NOW)).toBeNull();
  });

  it('delete reports whether a row was removed', () => {
    const { id } = repo.create({ ...base, id: ID1, title: 'A' }, NOW);
    expect(repo.delete(id)).toBe(true);
    expect(repo.delete(id)).toBe(false);
  });

  it('deleteCompleted removes only completed rows', () => {
    repo.create({ ...base, id: ID1, title: 'open' }, NOW);
    repo.create({ ...base, id: ID2, title: 'done', completed: true }, NOW);
    expect(repo.deleteCompleted()).toBe(1);
    expect(repo.findAll().map((t) => t.title)).toEqual(['open']);
  });

  it('findAll treats the search term as data, not SQL', () => {
    repo.create({ ...base, id: ID1, title: 'plain' }, NOW);
    expect(repo.findAll({ q: "' OR 1=1 --" })).toEqual([]);
    expect(repo.findAll({ q: 'LAI' })).toHaveLength(1);
  });

  describe('schema constraints', () => {
    let seq = 0;
    const insertRaw = (title, completed = 0, priority = 'medium', dueDate = null, id = uid(++seq)) =>
      db
        .prepare('INSERT INTO todos (id, title, completed, priority, due_date) VALUES (?, ?, ?, ?, ?)')
        .run(id, title, completed, priority, dueDate);

    it('FR-4: requires a 36-character lowercase id and has no SQL default', () => {
      expect(() =>
        db.prepare('INSERT INTO todos (title) VALUES (?)').run('no id'),
      ).toThrow(/NOT NULL/);
      expect(() => insertRaw('a', 0, 'medium', null, ID1.toUpperCase().replace('0', 'A'))).toThrow();
      expect(() => insertRaw('a', 0, 'medium', null, 'short')).toThrow();
      expect(() => insertRaw('a', 0, 'medium', null, ID1)).not.toThrow();
    });

    it('rejects empty and untrimmed titles', () => {
      expect(() => insertRaw('')).toThrow();
      expect(() => insertRaw(' padded ')).toThrow();
    });

    it('rejects titles over 200 characters', () => {
      expect(() => insertRaw('x'.repeat(201))).toThrow();
      expect(() => insertRaw('x'.repeat(200))).not.toThrow();
    });

    it('rejects invalid priority and completed values', () => {
      expect(() => insertRaw('a', 0, 'urgent')).toThrow();
      expect(() => insertRaw('a', 2)).toThrow();
    });

    it('rejects malformed due dates', () => {
      expect(() => insertRaw('a', 0, 'medium', 'soon')).toThrow();
    });
  });
});

describe('database setup', () => {
  it('creates a file database (and parent dir) and keeps data across reopen', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todolist-'));
    const file = path.join(dir, 'nested', 'todos.db');
    try {
      let db = openDatabase(file);
      createTodoRepository(db).create({ ...base, id: ID1, title: 'persisted' }, NOW);
      db.close();

      db = openDatabase(file);
      expect(createTodoRepository(db).findAll().map((t) => t.title)).toEqual(['persisted']);
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('seed.sql is idempotent', () => {
    const db = openDatabase(':memory:');
    const seed = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'seed.sql'), 'utf8');
    db.exec(seed);
    const first = db.prepare('SELECT COUNT(*) AS n FROM todos').get().n;
    db.exec(seed);
    const second = db.prepare('SELECT COUNT(*) AS n FROM todos').get().n;
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(first);
    const ids = db.prepare('SELECT id FROM todos').all().map((row) => row.id);
    ids.forEach((id) => expect(id).toMatch(UUID_V4_RE));
    expect(new Set(ids).size).toBe(ids.length);
    db.close();
  });
});
