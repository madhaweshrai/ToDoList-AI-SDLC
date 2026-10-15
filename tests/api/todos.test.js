const request = require('supertest');
const { openDatabase } = require('../../backend/src/db');
const { createApp } = require('../../backend/src/app');
const { UUID_V4_RE } = require('../../backend/src/validation');

const CLIENT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000009999';
const UPPER_UUID = CLIENT_ID.toUpperCase();
const V1_UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const ID_ERROR = { field: 'id', message: 'must be a lowercase v4 UUID' };

let db;
let app;

beforeEach(() => {
  db = openDatabase(':memory:');
  app = createApp({ db });
});

afterEach(() => {
  db.close();
});

async function createTodo(body) {
  const res = await request(app).post('/api/todos').send(body);
  expect(res.status).toBe(201);
  return res.body;
}

describe('GET /api/health', () => {
  it('returns {"status":"ok"}', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('POST /api/todos', () => {
  it('creates a todo with defaults and a trimmed title', async () => {
    const res = await request(app).post('/api/todos').send({ title: '  Buy milk  ' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.stringMatching(UUID_V4_RE),
      title: 'Buy milk',
      completed: false,
      priority: 'medium',
      dueDate: null,
    });
    expect(res.body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(res.body.updatedAt).toBe(res.body.createdAt);
  });

  it('accepts priority and dueDate', async () => {
    const todo = await createTodo({ title: 'Ship it', priority: 'high', dueDate: '2030-05-17' });
    expect(todo).toMatchObject({ priority: 'high', dueDate: '2030-05-17' });
  });

  it.each([
    ['missing title', {}],
    ['blank title', { title: '   ' }],
    ['non-string title', { title: 42 }],
    ['title over 200 chars', { title: 'x'.repeat(201) }],
    ['bad priority', { title: 'a', priority: 'urgent' }],
    ['non-date dueDate', { title: 'a', dueDate: 'tomorrow' }],
    ['impossible dueDate', { title: 'a', dueDate: '2030-02-31' }],
    ['non-boolean completed', { title: 'a', completed: 'yes' }],
  ])('rejects %s with 400', async (_name, body) => {
    const res = await request(app).post('/api/todos').send(body);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBeTruthy();
    expect(res.body.error.details).toEqual(expect.any(Array));
  });

  it('accepts a title of exactly 200 characters', async () => {
    const todo = await createTodo({ title: 'x'.repeat(200) });
    expect(todo.title).toHaveLength(200);
  });

  it('rejects malformed JSON with 400', async () => {
    const res = await request(app)
      .post('/api/todos')
      .set('Content-Type', 'application/json')
      .send('{"title": ');
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/malformed/i);
  });

  it('rejects a non-object body with 400', async () => {
    const res = await request(app).post('/api/todos').send([1, 2, 3]);
    expect(res.status).toBe(400);
  });

  it('stores SQL metacharacters literally (prepared statements)', async () => {
    const evil = "x'); DROP TABLE todos; --";
    await createTodo({ title: evil });
    const list = await request(app).get('/api/todos');
    expect(list.status).toBe(200);
    expect(list.body.map((t) => t.title)).toEqual([evil]);
  });
});

describe('GET /api/todos', () => {
  beforeEach(async () => {
    await createTodo({ title: 'Buy milk', priority: 'low' });
    await createTodo({ title: 'Write report', priority: 'high' });
    const done = await createTodo({ title: 'Call mum', priority: 'high' });
    await request(app).put(`/api/todos/${done.id}`).send({ completed: true });
  });

  it('lists all todos in creation order', async () => {
    const res = await request(app).get('/api/todos');
    expect(res.status).toBe(200);
    expect(res.body.map((t) => t.title)).toEqual(['Buy milk', 'Write report', 'Call mum']);
  });

  it('filters by status', async () => {
    const active = await request(app).get('/api/todos?status=active');
    expect(active.body.map((t) => t.title)).toEqual(['Buy milk', 'Write report']);
    const completed = await request(app).get('/api/todos?status=completed');
    expect(completed.body.map((t) => t.title)).toEqual(['Call mum']);
    const all = await request(app).get('/api/todos?status=all');
    expect(all.body).toHaveLength(3);
  });

  it('filters by priority', async () => {
    const res = await request(app).get('/api/todos?priority=high');
    expect(res.body.map((t) => t.title)).toEqual(['Write report', 'Call mum']);
  });

  it('searches titles case-insensitively with q', async () => {
    const res = await request(app).get('/api/todos?q=MILK');
    expect(res.body.map((t) => t.title)).toEqual(['Buy milk']);
  });

  it('treats LIKE wildcards in q literally', async () => {
    await createTodo({ title: '100% done' });
    const percent = await request(app).get('/api/todos').query({ q: '%' });
    expect(percent.body.map((t) => t.title)).toEqual(['100% done']);
    const underscore = await request(app).get('/api/todos').query({ q: '_' });
    expect(underscore.body).toEqual([]);
  });

  it('combines filters', async () => {
    const res = await request(app).get('/api/todos?status=active&priority=high&q=report');
    expect(res.body.map((t) => t.title)).toEqual(['Write report']);
  });

  it.each([
    ['status=bogus'],
    ['priority=bogus'],
    ['q=a&q=b'],
    [`q=${'x'.repeat(201)}`],
  ])('rejects invalid query %s with 400', async (query) => {
    const res = await request(app).get(`/api/todos?${query}`);
    expect(res.status).toBe(400);
  });
});

describe('GET /api/todos/:id', () => {
  it('returns one todo', async () => {
    const todo = await createTodo({ title: 'One' });
    const res = await request(app).get(`/api/todos/${todo.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(todo);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get(`/api/todos/${UNKNOWN_ID}`);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/not found/i);
  });

  it.each(['abc', '0', '1', '-1', '1.5', '1e3', UPPER_UUID, V1_UUID])('returns 400 for invalid id %s', async (id) => {
    const res = await request(app).get(`/api/todos/${id}`);
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/todos/:id', () => {
  it('updates fields and bumps updatedAt', async () => {
    const todo = await createTodo({ title: 'Old', priority: 'low' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const res = await request(app)
      .put(`/api/todos/${todo.id}`)
      .send({ title: ' New ', completed: true, priority: 'high', dueDate: '2031-01-02' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: todo.id,
      title: 'New',
      completed: true,
      priority: 'high',
      dueDate: '2031-01-02',
      createdAt: todo.createdAt,
    });
    expect(res.body.updatedAt > todo.updatedAt).toBe(true);
  });

  it('persists completed state across requests', async () => {
    const todo = await createTodo({ title: 'Persist me' });
    await request(app).put(`/api/todos/${todo.id}`).send({ completed: true });
    const res = await request(app).get(`/api/todos/${todo.id}`);
    expect(res.body.completed).toBe(true);
  });

  it('applies partial updates without touching other fields', async () => {
    const todo = await createTodo({ title: 'Keep', priority: 'high', dueDate: '2030-01-01' });
    const res = await request(app).put(`/api/todos/${todo.id}`).send({ completed: true });
    expect(res.body).toMatchObject({ title: 'Keep', priority: 'high', dueDate: '2030-01-01', completed: true });
  });

  it('clears dueDate with null', async () => {
    const todo = await createTodo({ title: 'Due', dueDate: '2030-01-01' });
    const res = await request(app).put(`/api/todos/${todo.id}`).send({ dueDate: null });
    expect(res.body.dueDate).toBeNull();
  });

  it.each([
    ['blank title', { title: '  ' }],
    ['bad priority', { priority: 'meh' }],
    ['bad completed', { completed: 1 }],
    ['bad dueDate', { dueDate: '31/01/2030' }],
    ['empty body', {}],
  ])('rejects %s with 400', async (_name, body) => {
    const todo = await createTodo({ title: 'Target' });
    const res = await request(app).put(`/api/todos/${todo.id}`).send(body);
    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).put(`/api/todos/${UNKNOWN_ID}`).send({ completed: true });
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid id', async () => {
    const res = await request(app).put('/api/todos/abc').send({ completed: true });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/todos/:id', () => {
  it('AC-2: deletes by id, even when titles are duplicated', async () => {
    const first = await createTodo({ title: 'Same' });
    const second = await createTodo({ title: 'Same' });

    const res = await request(app).delete(`/api/todos/${second.id}`);
    expect(res.status).toBe(204);

    const list = await request(app).get('/api/todos');
    expect(list.body.map((t) => t.id)).toEqual([first.id]);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).delete(`/api/todos/${UNKNOWN_ID}`);
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid id', async () => {
    const res = await request(app).delete('/api/todos/abc');
    expect(res.status).toBe(400);
  });
});

describe('AC-5: client-supplied UUID ids', () => {
  it('AC-5: POST with a valid client id returns 201 with that id', async () => {
    const res = await request(app).post('/api/todos').send({ id: CLIENT_ID, title: 'Client id' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(CLIENT_ID);
  });

  it('AC-1: the stored todo is retrievable by the client id and listed with it', async () => {
    await createTodo({ id: CLIENT_ID, title: 'Round trip' });
    const one = await request(app).get(`/api/todos/${CLIENT_ID}`);
    expect(one.status).toBe(200);
    expect(one.body).toMatchObject({ id: CLIENT_ID, title: 'Round trip' });
    const list = await request(app).get('/api/todos');
    expect(list.body.map((t) => t.id)).toEqual([CLIENT_ID]);
  });

  it('NFR-3: POST without an id returns 201 with a server-generated v4 UUID', async () => {
    const first = await createTodo({ title: 'No id' });
    const second = await createTodo({ title: 'No id either' });
    expect(first.id).toMatch(UUID_V4_RE);
    expect(second.id).toMatch(UUID_V4_RE);
    expect(second.id).not.toBe(first.id);
  });

  it.each([
    ['malformed', 'abc'],
    ['upper case', UPPER_UUID],
    ['v1', V1_UUID],
    ['numeric', 5],
    ['null', null],
  ])('EH-1: POST with a %s id returns 400 with an id detail and stores nothing', async (_name, id) => {
    const res = await request(app).post('/api/todos').send({ id, title: 'Bad id' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { message: 'Validation failed', details: [ID_ERROR] } });
    const list = await request(app).get('/api/todos');
    expect(list.body).toEqual([]);
  });

  it('EH-2: POST with a duplicate id returns 409 and leaves the original unchanged', async () => {
    const original = await createTodo({ id: CLIENT_ID, title: 'Original', priority: 'high' });
    const res = await request(app).post('/api/todos').send({ id: CLIENT_ID, title: 'Impostor' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: { message: `Todo ${CLIENT_ID} already exists` } });
    const list = await request(app).get('/api/todos');
    expect(list.body).toEqual([original]);
  });

  it('EH-3: GET, PUT and DELETE return 400 for a malformed id and 404 for an unknown UUID', async () => {
    const calls = [
      (id) => request(app).get(`/api/todos/${id}`),
      (id) => request(app).put(`/api/todos/${id}`).send({ completed: true }),
      (id) => request(app).delete(`/api/todos/${id}`),
    ];
    for (const call of calls) {
      const bad = await call(UPPER_UUID);
      expect(bad.status).toBe(400);
      expect(bad.body.error.details).toEqual([ID_ERROR]);
      const unknown = await call(UNKNOWN_ID);
      expect(unknown.status).toBe(404);
    }
  });

  it('PUT ignores an id in the body and keeps the stored id', async () => {
    await createTodo({ id: CLIENT_ID, title: 'Keep my id' });
    const res = await request(app).put(`/api/todos/${CLIENT_ID}`).send({ id: UNKNOWN_ID, completed: true });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: CLIENT_ID, completed: true });
  });
});

describe('DELETE /api/todos?completed=true', () => {
  it('removes only completed todos and reports the count', async () => {
    const keep = await createTodo({ title: 'Keep' });
    const done1 = await createTodo({ title: 'Done 1' });
    await createTodo({ title: 'Done 2', completed: true });
    await request(app).put(`/api/todos/${done1.id}`).send({ completed: true });

    const res = await request(app).delete('/api/todos?completed=true');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: 2 });

    const list = await request(app).get('/api/todos');
    expect(list.body.map((t) => t.id)).toEqual([keep.id]);
  });

  it('requires completed=true', async () => {
    await createTodo({ title: 'Safe' });
    const missing = await request(app).delete('/api/todos');
    expect(missing.status).toBe(400);
    const wrong = await request(app).delete('/api/todos?completed=false');
    expect(wrong.status).toBe(400);
    const list = await request(app).get('/api/todos');
    expect(list.body).toHaveLength(1);
  });
});

describe('error handling', () => {
  it('returns JSON 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toBeTruthy();
  });

  it('returns 500 with a generic message when the service throws', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const failing = createApp({
      service: {
        list() {
          throw new Error('database exploded: secret detail');
        },
      },
    });
    const res = await request(failing).get('/api/todos');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { message: 'Internal server error' } });
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
    spy.mockRestore();
  });

  it('returns 413 for oversized bodies', async () => {
    const res = await request(app).post('/api/todos').send({ title: 'x'.repeat(20000) });
    expect(res.status).toBe(413);
  });
});

describe('static frontend', () => {
  it('serves index.html at /', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('data-testid="todo-input"');
  });

  it('serves JS and CSS assets', async () => {
    expect((await request(app).get('/JS/main.js')).status).toBe(200);
    expect((await request(app).get('/CSS/main.css')).status).toBe(200);
  });

  it('does not expose backend source or the database', async () => {
    expect((await request(app).get('/backend/server.js')).status).toBe(404);
    expect((await request(app).get('/package.json')).status).toBe(404);
    expect((await request(app).get('/db/schema.sql')).status).toBe(404);
  });
});
