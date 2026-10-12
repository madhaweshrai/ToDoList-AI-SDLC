const fs = require('fs');
const os = require('os');
const path = require('path');
const { openDatabase } = require('../../backend/src/db');
const { createTodoRepository } = require('../../backend/src/repositories/todoRepository');

const NOW = '2030-01-01T00:00:00.000Z';
const base = { completed: false, priority: 'medium', dueDate: null };

describe('todoRepository', () => {
  let db;
  let repo;

  beforeEach(() => {
    db = openDatabase(':memory:');
    repo = createTodoRepository(db);
  });

  afterEach(() => db.close());

  it('maps rows to camelCase todos with boolean completed', () => {
    const todo = repo.create({ ...base, title: 'A', dueDate: '2030-02-02' }, NOW);
    expect(todo).toEqual({
      id: 1,
      title: 'A',
      completed: false,
      priority: 'medium',
      dueDate: '2030-02-02',
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('update returns null for a missing id', () => {
    expect(repo.update(99, { ...base, title: 'x' }, NOW)).toBeNull();
  });

  it('delete reports whether a row was removed', () => {
    const { id } = repo.create({ ...base, title: 'A' }, NOW);
    expect(repo.delete(id)).toBe(true);
    expect(repo.delete(id)).toBe(false);
  });

  it('deleteCompleted removes only completed rows', () => {
    repo.create({ ...base, title: 'open' }, NOW);
    repo.create({ ...base, title: 'done', completed: true }, NOW);
    expect(repo.deleteCompleted()).toBe(1);
    expect(repo.findAll().map((t) => t.title)).toEqual(['open']);
  });

  it('findAll treats the search term as data, not SQL', () => {
    repo.create({ ...base, title: 'plain' }, NOW);
    expect(repo.findAll({ q: "' OR 1=1 --" })).toEqual([]);
    expect(repo.findAll({ q: 'LAI' })).toHaveLength(1);
  });

  describe('schema constraints', () => {
    const insertRaw = (title, completed = 0, priority = 'medium', dueDate = null) =>
      db
        .prepare('INSERT INTO todos (title, completed, priority, due_date) VALUES (?, ?, ?, ?)')
        .run(title, completed, priority, dueDate);

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
      createTodoRepository(db).create({ ...base, title: 'persisted' }, NOW);
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
    db.close();
  });
});
