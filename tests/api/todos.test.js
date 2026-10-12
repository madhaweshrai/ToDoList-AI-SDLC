const request = require('supertest');
const { openDatabase } = require('../../backend/src/db');
const { createApp } = require('../../backend/src/app');

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
      id: expect.any(Number),
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
    const res = await request(app).get('/api/todos/9999');
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/not found/i);
  });

  it.each(['abc', '0', '-1', '1.5', '1e3'])('returns 400 for invalid id %s', async (id) => {
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
    const res = await request(app).put('/api/todos/9999').send({ completed: true });
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid id', async () => {
    const res = await request(app).put('/api/todos/abc').send({ completed: true });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/todos/:id', () => {
  it('deletes by id, even when titles are duplicated', async () => {
    const first = await createTodo({ title: 'Same' });
    const second = await createTodo({ title: 'Same' });

    const res = await request(app).delete(`/api/todos/${second.id}`);
    expect(res.status).toBe(204);

    const list = await request(app).get('/api/todos');
    expect(list.body.map((t) => t.id)).toEqual([first.id]);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).delete('/api/todos/9999');
    expect(res.status).toBe(404);
  });

  it('returns 400 for an invalid id', async () => {
    const res = await request(app).delete('/api/todos/abc');
    expect(res.status).toBe(400);
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
