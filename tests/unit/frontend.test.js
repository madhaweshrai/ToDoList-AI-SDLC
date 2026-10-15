/**
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const indexHtml = read('index.html');
const scripts = {
  api: read('JS/api.js'),
  time: read('JS/time.js'),
  model: read('JS/todo-model.js'),
  legacy: read('JS/legacy-import.js'),
  main: read('JS/main.js'),
};

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ID_DETAIL = { field: 'id', message: 'must be a lowercase v4 UUID' };

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const byTestId = (id, scope = document) => scope.querySelector(`[data-testid="${id}"]`);
const allByTestId = (id, scope = document) => Array.from(scope.querySelectorAll(`[data-testid="${id}"]`));

/**
 * In-memory fetch mock that behaves like the real API (D-8): UUID ids, real error shapes, id ignored on PUT.
 * `failPost(body, postIndex)` may return 'network' (reject, nothing stored), 'lost' (store, then reject),
 * a status number, or `{ status, details }`.
 */
function createServer(initial = [], { failPost } = {}) {
  const todos = initial.map((todo, index) => ({
    id: uid(index + 1),
    title: todo.title,
    completed: Boolean(todo.completed),
    priority: todo.priority || 'medium',
    dueDate: todo.dueDate || null,
  }));
  let nextSeq = todos.length + 1;
  let postIndex = 0;
  const calls = [];

  const reply = (status, payload) => ({
    ok: status < 400,
    status,
    json: async () => {
      if (payload === undefined) throw new Error('no body');
      return payload;
    },
  });

  const fetchMock = jest.fn(async (url, options = {}) => {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    calls.push({ method, url, body });
    const parsed = new URL(url, 'http://localhost');
    const idMatch = parsed.pathname.match(/^\/api\/todos\/([^/]+)$/);

    if (parsed.pathname === '/api/todos') {
      if (method === 'GET') {
        const status = parsed.searchParams.get('status') || 'all';
        const q = (parsed.searchParams.get('q') || '').toLowerCase();
        return reply(
          200,
          todos
            .filter((t) => status === 'all' || (status === 'completed') === t.completed)
            .filter((t) => t.title.toLowerCase().includes(q))
            .map((t) => ({ ...t })),
        );
      }
      if (method === 'POST') {
        const failure = failPost ? failPost(body, postIndex) : null;
        postIndex += 1;
        if (failure === 'network') throw new TypeError('Failed to fetch');
        if (typeof failure === 'number') return reply(failure, { error: { message: `Request failed (${failure})` } });
        if (failure && typeof failure === 'object') {
          return reply(failure.status, { error: { message: 'Validation failed', details: failure.details } });
        }
        if (body.id !== undefined && !V4.test(body.id)) {
          return reply(400, { error: { message: 'Validation failed', details: [ID_DETAIL] } });
        }
        if (todos.some((t) => t.id === body.id)) {
          return reply(409, { error: { message: `Todo ${body.id} already exists` } });
        }
        const todo = { completed: false, priority: 'medium', dueDate: null, ...body, id: body.id ?? uid(nextSeq++) };
        todos.push(todo);
        if (failure === 'lost') throw new TypeError('Failed to fetch');
        return reply(201, { ...todo });
      }
      if (method === 'DELETE' && parsed.searchParams.get('completed') === 'true') {
        const before = todos.length;
        for (let i = todos.length - 1; i >= 0; i -= 1) if (todos[i].completed) todos.splice(i, 1);
        return reply(200, { deleted: before - todos.length });
      }
    }
    if (idMatch) {
      const id = decodeURIComponent(idMatch[1]);
      if (!V4.test(id)) return reply(400, { error: { message: 'Invalid todo id', details: [ID_DETAIL] } });
      const index = todos.findIndex((t) => t.id === id);
      if (index === -1) return reply(404, { error: { message: `Todo ${id} not found` } });
      if (method === 'PUT') {
        const { id: ignoredId, ...changes } = body;
        Object.assign(todos[index], changes);
        return reply(200, { ...todos[index] });
      }
      if (method === 'DELETE') {
        todos.splice(index, 1);
        return reply(204);
      }
    }
    return reply(500, { error: { message: 'unexpected request' } });
  });

  return { todos, calls, fetchMock };
}

async function boot(server) {
  document.body.innerHTML = new DOMParser().parseFromString(indexHtml, 'text/html').body.innerHTML;
  document.body.className = '';
  global.fetch = server.fetchMock;
  (0, eval)(scripts.api);
  (0, eval)(scripts.time);
  (0, eval)(scripts.model);
  (0, eval)(scripts.legacy);
  (0, eval)(scripts.main);
  await settle();
}

const posts = (server) => server.calls.filter((call) => call.method === 'POST');
const renderedIds = () => allByTestId('todo-item').map((li) => li.dataset.id);
const notice = () => byTestId('import-notice');
const noticeText = () => byTestId('import-notice-text').textContent;

function type(input, value) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function submitForm() {
  $('#todo-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

const titles = () => allByTestId('todo-title').map((node) => node.textContent);

beforeEach(() => {
  localStorage.clear();
  window.alert = jest.fn();
});

describe('AC-9: regression of existing behaviour (FR-12)', () => {
  describe('markup', () => {
    beforeEach(() => boot(createServer()));

    it('has the required data-testid hooks', () => {
      ['todo-input', 'add-btn', 'filter-all', 'filter-active', 'filter-completed'].forEach((id) => {
        expect(byTestId(id)).not.toBeNull();
      });
    });

    it('closes div.version and keeps the clock outside it', () => {
      const version = $('.version');
      expect(version).not.toBeNull();
      expect(version.contains($('#datetime'))).toBe(false);
      expect(version.contains($('#todo-form'))).toBe(false);
      expect((indexHtml.match(/<div/g) || []).length).toBe((indexHtml.match(/<\/div>/g) || []).length);
    });

    it('points the GitHub corner at madhaweshrai/ToDoList', () => {
      expect($('.github-corner').getAttribute('href')).toBe('https://github.com/madhaweshrai/ToDoList');
    });

    it('uses real buttons with labels for theme selection', () => {
      const selectors = $$('.theme-selector');
      expect(selectors).toHaveLength(3);
      selectors.forEach((node) => {
        expect(node.tagName).toBe('BUTTON');
        expect(node.getAttribute('type')).toBe('button');
        expect(node.getAttribute('aria-label')).toBeTruthy();
      });
    });
  });

  describe('listing and rendering', () => {
    it('renders todos from the API with priority and due date', async () => {
      const server = createServer([
        { title: 'First', priority: 'high', dueDate: '2099-01-01' },
        { title: 'Second', completed: true },
      ]);
      await boot(server);

      expect(allByTestId('todo-item')).toHaveLength(2);
      expect(titles()).toEqual(['First', 'Second']);
      expect(byTestId('priority-badge').textContent).toBe('high');
      expect(byTestId('due-date').textContent).toBe('Due 2099-01-01');
      expect(allByTestId('todo-item')[1].classList.contains('completed')).toBe(true);
    });

    it('never interprets user text as HTML', async () => {
      const payload = '<img src=x onerror="window.pwned=1"><b>bold</b>';
      await boot(createServer([{ title: payload }]));

      expect(byTestId('todo-title').textContent).toBe(payload);
      expect($('.todo-list img')).toBeNull();
      expect($('.todo-list b')).toBeNull();
      expect(window.pwned).toBeUndefined();
    });

    it('labels every icon button for assistive tech', async () => {
      await boot(createServer([{ title: 'Label me' }]));
      ['check-btn', 'edit-btn', 'delete-btn'].forEach((id) => {
        const button = byTestId(id);
        expect(button.getAttribute('aria-label')).toContain('Label me');
        expect(button.querySelector('i').getAttribute('aria-hidden')).toBe('true');
      });
    });

    it('shows an empty state', async () => {
      await boot(createServer());
      expect(byTestId('empty-state')).not.toBeNull();
    });

    it('shows an error message when the API is unreachable', async () => {
      const server = createServer();
      server.fetchMock.mockRejectedValue(new TypeError('network down'));
      await boot(server);
      expect(byTestId('app-message').hidden).toBe(false);
      expect(byTestId('app-message').textContent).toMatch(/could not reach the server/i);
    });
  });

  describe('adding tasks', () => {
    it('trims input and posts title, priority and due date', async () => {
      const server = createServer();
      await boot(server);

      type(byTestId('todo-input'), '  Buy milk  ');
      $('#priority-input').value = 'high';
      $('#due-input').value = '2031-04-05';
      byTestId('add-btn').click();
      await settle();

      const post = server.calls.find((call) => call.method === 'POST');
      expect(post.body).toEqual({ id: expect.stringMatching(V4), title: 'Buy milk', priority: 'high', dueDate: '2031-04-05' });
      expect(titles()).toEqual(['Buy milk']);
      expect(byTestId('todo-input').value).toBe('');
    });

    it.each(['', '    '])('rejects blank input %p with an inline message, not alert()', async (value) => {
      const server = createServer();
      await boot(server);

      type(byTestId('todo-input'), value);
      byTestId('add-btn').click();
      await settle();

      expect(window.alert).not.toHaveBeenCalled();
      expect(byTestId('form-message').hidden).toBe(false);
      expect(byTestId('form-message').textContent).toMatch(/enter a task/i);
      expect(server.calls.some((call) => call.method === 'POST')).toBe(false);
    });

    it('clears the inline message after a successful add', async () => {
      await boot(createServer());
      byTestId('add-btn').click();
      await settle();
      expect(byTestId('form-message').hidden).toBe(false);

      type(byTestId('todo-input'), 'Now valid');
      byTestId('add-btn').click();
      await settle();
      expect(byTestId('form-message').hidden).toBe(true);
    });

    it('shows server validation errors inline', async () => {
      const server = createServer();
      await boot(server);
      const original = server.fetchMock.getMockImplementation();
      server.fetchMock.mockImplementation(async (url, options) => {
        if (options && options.method === 'POST') {
          return { ok: false, status: 400, json: async () => ({ error: { message: 'Validation failed' } }) };
        }
        return original(url, options);
      });

      type(byTestId('todo-input'), 'x');
      byTestId('add-btn').click();
      await settle();
      expect(byTestId('form-message').textContent).toBe('Validation failed');
    });
  });

  describe('completing and persisting state', () => {
    it('toggles via PUT and the completed state survives a reload', async () => {
      const server = createServer([{ title: 'Persist' }]);
      await boot(server);

      byTestId('check-btn').click();
      await settle();
      const put = server.calls.find((call) => call.method === 'PUT');
      expect(put.url).toBe(`/api/todos/${uid(1)}`);
      expect(put.body).toEqual({ completed: true });
      expect(byTestId('todo-item').classList.contains('completed')).toBe(true);

      await boot(server);
      expect(byTestId('todo-item').classList.contains('completed')).toBe(true);
      expect(byTestId('check-btn').getAttribute('aria-pressed')).toBe('true');
    });

    it('can toggle back to active', async () => {
      const server = createServer([{ title: 'Undo', completed: true }]);
      await boot(server);
      byTestId('check-btn').click();
      await settle();
      expect(server.calls.find((call) => call.method === 'PUT').body).toEqual({ completed: false });
      expect(byTestId('todo-item').classList.contains('completed')).toBe(false);
    });
  });

  describe('deleting', () => {
    it('AC-2: deletes by id, not by text, when titles are duplicated', async () => {
      const server = createServer([{ title: 'Call mom' }, { title: 'Call mom' }]);
      await boot(server);

      allByTestId('delete-btn')[1].click();
      await settle();
      await wait(700);

      const del = server.calls.find((call) => call.method === 'DELETE');
      expect(del.url).toBe(`/api/todos/${uid(2)}`);
      expect(server.todos.map((t) => t.id)).toEqual([uid(1)]);
      expect(allByTestId('todo-item')).toHaveLength(1);
      expect(titles()).toEqual(['Call mom']);
      expect(renderedIds()).toEqual([uid(1)]);
    });

    it('AC-2: toggles only the todo with the matching id', async () => {
      const server = createServer([{ title: 'Call mom' }, { title: 'Call mom' }]);
      await boot(server);

      allByTestId('check-btn')[0].click();
      await settle();

      expect(server.todos.map((t) => t.completed)).toEqual([true, false]);
    });
  });

  describe('editing', () => {
    it('edits title, priority and due date inline', async () => {
      const server = createServer([{ title: 'Old', priority: 'low' }]);
      await boot(server);

      byTestId('edit-btn').click();
      const input = byTestId('edit-input');
      expect(input.value).toBe('Old');
      type(input, '  New title ');
      byTestId('edit-priority').value = 'high';
      byTestId('edit-due').value = '2032-06-07';
      byTestId('save-btn').click();
      await settle();

      const put = server.calls.find((call) => call.method === 'PUT');
      expect(put.body).toEqual({ title: 'New title', priority: 'high', dueDate: '2032-06-07' });
      expect(titles()).toEqual(['New title']);
      expect(byTestId('edit-input')).toBeNull();
    });

    it('rejects a blank title inline and keeps editing', async () => {
      const server = createServer([{ title: 'Keep' }]);
      await boot(server);

      byTestId('edit-btn').click();
      type(byTestId('edit-input'), '   ');
      byTestId('save-btn').click();
      await settle();

      expect(byTestId('edit-error').hidden).toBe(false);
      expect(byTestId('edit-input')).not.toBeNull();
      expect(server.calls.some((call) => call.method === 'PUT')).toBe(false);
    });

    it('cancels without saving', async () => {
      const server = createServer([{ title: 'Same' }]);
      await boot(server);

      byTestId('edit-btn').click();
      type(byTestId('edit-input'), 'Changed');
      byTestId('cancel-btn').click();

      expect(titles()).toEqual(['Same']);
      expect(server.calls.some((call) => call.method === 'PUT')).toBe(false);
    });

    it('saves on Enter and cancels on Escape', async () => {
      const server = createServer([{ title: 'Key' }]);
      await boot(server);

      byTestId('edit-btn').click();
      byTestId('edit-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(byTestId('edit-input')).toBeNull();

      byTestId('edit-btn').click();
      type(byTestId('edit-input'), 'Entered');
      byTestId('edit-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      await settle();
      expect(titles()).toEqual(['Entered']);
    });
  });

  describe('filters, search and clear completed', () => {
    const seed = [{ title: 'Alpha' }, { title: 'Beta', completed: true }, { title: 'Alphabet', completed: true }];

    it('filters by status through the API and updates aria-pressed', async () => {
      const server = createServer(seed);
      await boot(server);
      expect(titles()).toEqual(['Alpha', 'Beta', 'Alphabet']);

      byTestId('filter-active').click();
      await settle();
      expect(server.calls.some((call) => call.url === '/api/todos?status=active')).toBe(true);
      expect(titles()).toEqual(['Alpha']);
      expect(byTestId('filter-active').getAttribute('aria-pressed')).toBe('true');
      expect(byTestId('filter-all').getAttribute('aria-pressed')).toBe('false');

      byTestId('filter-completed').click();
      await settle();
      expect(titles()).toEqual(['Beta', 'Alphabet']);

      byTestId('filter-all').click();
      await settle();
      expect(titles()).toHaveLength(3);
    });

    it('searches with a debounce', async () => {
      const server = createServer(seed);
      await boot(server);
      const before = server.calls.length;

      type(byTestId('search-input'), 'alp');
      type(byTestId('search-input'), 'alph');
      await wait(400);

      expect(server.calls.length).toBe(before + 1);
      expect(server.calls[server.calls.length - 1].url).toBe('/api/todos?q=alph');
      expect(titles()).toEqual(['Alpha', 'Alphabet']);
    });

    it('keeps the search term when switching filters', async () => {
      const server = createServer(seed);
      await boot(server);
      type(byTestId('search-input'), 'alph');
      await wait(400);
      byTestId('filter-completed').click();
      await settle();
      expect(server.calls[server.calls.length - 1].url).toBe('/api/todos?status=completed&q=alph');
      expect(titles()).toEqual(['Alphabet']);
    });

    it('clears completed tasks', async () => {
      const server = createServer(seed);
      await boot(server);

      byTestId('clear-completed-btn').click();
      await settle();

      expect(server.calls.some((call) => call.method === 'DELETE' && call.url === '/api/todos?completed=true')).toBe(true);
      expect(titles()).toEqual(['Alpha']);
    });
  });

  describe('themes', () => {
    it('defaults to standard and persists the chosen theme in localStorage', async () => {
      const server = createServer([{ title: 'Themed' }]);
      await boot(server);
      expect(document.body.className).toBe('standard');
      expect(byTestId('todo-item').classList.contains('standard-todo')).toBe(true);

      $('.darker-theme').click();
      expect(localStorage.getItem('savedTheme')).toBe('darker');
      expect(document.body.className).toBe('darker');
      expect(byTestId('todo-item').classList.contains('darker-todo')).toBe(true);
      expect(byTestId('check-btn').classList.contains('darker-button')).toBe(true);
      expect(byTestId('todo-input').classList.contains('darker-input')).toBe(true);
      expect($('.darker-theme').getAttribute('aria-pressed')).toBe('true');

      await boot(server);
      expect(document.body.className).toBe('darker');
    });

    it('falls back to standard when the stored theme is invalid', async () => {
      localStorage.setItem('savedTheme', '<script>');
      await boot(createServer());
      expect(document.body.className).toBe('standard');
    });

    it('does not store todos in localStorage', async () => {
      await boot(createServer());
      type(byTestId('todo-input'), 'API only');
      byTestId('add-btn').click();
      await settle();
      expect(localStorage.getItem('todos')).toBeNull();
    });
  });

  describe('live clock', () => {
    afterEach(() => jest.useRealTimers());

    it('updates every second', async () => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2030-01-01T10:00:00'));
      document.body.innerHTML = '<span id="datetime"></span>';
      (0, eval)(scripts.time);
      const first = $('#datetime').textContent;
      expect(first).not.toBe('');

      jest.setSystemTime(new Date('2030-01-01T10:00:01'));
      jest.advanceTimersByTime(1000);
      expect($('#datetime').textContent).not.toBe(first);
    });
  });
});

describe('fetch mock parity with the real API (D-8)', () => {
  const call = async (server, url, method, body) => {
    const res = await server.fetchMock(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => undefined) };
  };

  it('rejects a non-v4 id with field "id", answers 409 for a duplicate and ignores id on PUT', async () => {
    const server = createServer([{ title: 'Keep id' }]);

    const upper = await call(server, '/api/todos', 'POST', { id: 'ABCDEF00-0000-4000-8000-000000000001', title: 'x' });
    expect(upper.status).toBe(400);
    expect(upper.body.error.details[0].field).toBe('id');

    const dup = await call(server, '/api/todos', 'POST', { id: uid(1), title: 'x' });
    expect(dup).toEqual({ status: 409, body: { error: { message: `Todo ${uid(1)} already exists` } } });

    const put = await call(server, `/api/todos/${uid(1)}`, 'PUT', { id: 'x', completed: true });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ id: uid(1), completed: true });

    expect((await call(server, '/api/todos/1', 'DELETE')).status).toBe(400);
    expect((await call(server, `/api/todos/${uid(99)}`, 'DELETE')).status).toBe(404);
  });
});

describe('stable client ids (EPMCDMETST-68130)', () => {
  it('AC-1: the POSTed id equals the stored id and the rendered data-id', async () => {
    const server = createServer();
    await boot(server);

    type(byTestId('todo-input'), 'Buy milk');
    byTestId('add-btn').click();
    await settle();

    const [post] = posts(server);
    expect(post.body.id).toMatch(V4);
    expect(post.body.title).toBe('Buy milk');
    expect(server.todos.map((t) => t.id)).toEqual([post.body.id]);
    expect(renderedIds()).toEqual([post.body.id]);
  });

  it('AC-1 / FR-9: adding the same title twice creates two todos with different ids', async () => {
    const server = createServer();
    await boot(server);

    for (let i = 0; i < 2; i += 1) {
      type(byTestId('todo-input'), 'Call mom');
      byTestId('add-btn').click();
      await settle();
    }

    const ids = posts(server).map((p) => p.body.id);
    expect(new Set(ids).size).toBe(2);
    expect(renderedIds()).toEqual(ids);
  });

  it('AC-4: posts a valid v4 id when crypto.randomUUID is unavailable', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(window.crypto, 'randomUUID');
    Object.defineProperty(window.crypto, 'randomUUID', { value: undefined, configurable: true, writable: true });
    const getRandomValues = jest.spyOn(window.crypto, 'getRandomValues');
    try {
      expect(window.crypto.randomUUID).toBeUndefined();
      const server = createServer();
      await boot(server);
      for (const title of ['One', 'Two']) {
        type(byTestId('todo-input'), title);
        byTestId('add-btn').click();
        await settle();
      }
      const ids = posts(server).map((p) => p.body.id);
      ids.forEach((id) => expect(id).toMatch(V4));
      expect(new Set(ids).size).toBe(2);
      expect(renderedIds()).toEqual(ids);
      expect(getRandomValues).toHaveBeenCalledTimes(2);
    } finally {
      getRandomValues.mockRestore();
      delete window.crypto.randomUUID;
      if (descriptor) Object.defineProperty(window.crypto, 'randomUUID', descriptor);
    }
  });

  it('AC-10: after a lost response, Add resends the same id and the 409 counts as saved', async () => {
    const server = createServer([], { failPost: (_body, i) => (i === 0 ? 'lost' : null) });
    await boot(server);

    type(byTestId('todo-input'), 'Pay rent');
    byTestId('add-btn').click();
    await settle();
    expect(byTestId('form-message').hidden).toBe(false);
    expect(byTestId('form-message').textContent).toMatch(/could not reach the server/i);
    expect(byTestId('todo-input').value).toBe('Pay rent');

    byTestId('add-btn').click();
    await settle();

    const [first, second] = posts(server);
    expect(second.body.id).toBe(first.body.id);
    expect(byTestId('form-message').hidden).toBe(true);
    expect(byTestId('todo-input').value).toBe('');
    expect(server.todos).toHaveLength(1);
    expect(titles()).toEqual(['Pay rent']);
    expect(renderedIds()).toEqual([first.body.id]);
  });

  it('AC-10: a changed input after a failure sends a new id', async () => {
    const server = createServer([], { failPost: (_body, i) => (i === 0 ? 'network' : null) });
    await boot(server);

    type(byTestId('todo-input'), 'Pay rent');
    byTestId('add-btn').click();
    await settle();
    type(byTestId('todo-input'), 'Pay rent today');
    byTestId('add-btn').click();
    await settle();

    const [first, second] = posts(server);
    expect(second.body.id).not.toBe(first.body.id);
    expect(server.todos.map((t) => t.title)).toEqual(['Pay rent today']);
  });

  it('AC-10: changing only the priority after a failure also sends a new id', async () => {
    const server = createServer([], { failPost: (_body, i) => (i === 0 ? 'network' : null) });
    await boot(server);

    type(byTestId('todo-input'), 'Pay rent');
    byTestId('add-btn').click();
    await settle();
    $('#priority-input').value = 'high';
    byTestId('add-btn').click();
    await settle();

    const [first, second] = posts(server);
    expect(second.body.id).not.toBe(first.body.id);
  });

  it('FR-13: a non-409 server error keeps the draft id for the retry', async () => {
    const server = createServer([], { failPost: (_body, i) => (i === 0 ? 500 : null) });
    await boot(server);

    type(byTestId('todo-input'), 'Retry me');
    byTestId('add-btn').click();
    await settle();
    expect(byTestId('form-message').textContent).toBe('Request failed (500)');

    byTestId('add-btn').click();
    await settle();

    const [first, second] = posts(server);
    expect(second.body.id).toBe(first.body.id);
    expect(titles()).toEqual(['Retry me']);
  });
});

describe('legacy localStorage import (FR-10)', () => {
  it('AC-3: imports ["A","B"] with ids before the first list, removes the key and keeps savedTheme', async () => {
    localStorage.setItem('todos', JSON.stringify(['A', 'B']));
    localStorage.setItem('savedTheme', 'darker');
    const server = createServer();
    const original = server.fetchMock.getMockImplementation();
    const noticeDuringPost = [];
    server.fetchMock.mockImplementation(async (url, options) => {
      if (options && options.method === 'POST') noticeDuringPost.push(noticeText());
      return original(url, options);
    });

    await boot(server);

    const bodies = posts(server).map((p) => p.body);
    expect(bodies.map((b) => b.title)).toEqual(['A', 'B']);
    bodies.forEach((b) => {
      expect(b.id).toMatch(V4);
      expect(b.completed).toBe(false);
    });
    expect(server.calls[0].method).toBe('POST');
    expect(noticeDuringPost[0]).toBe('Importing 2 task(s) from the previous version…');
    expect(localStorage.getItem('todos')).toBeNull();
    expect(titles()).toEqual(['A', 'B']);
    expect(renderedIds()).toEqual(bodies.map((b) => b.id));

    expect(notice().hidden).toBe(false);
    expect(noticeText()).toBe('Imported 2 task(s) from the previous version');
    byTestId('import-notice-dismiss').click();
    expect(notice().hidden).toBe(true);

    expect(localStorage.getItem('savedTheme')).toBe('darker');
    expect(document.body.className).toBe('darker');
  });

  it('NFR-1: renders a legacy title containing HTML as text', async () => {
    const payload = '<img src=x onerror="window.pwnedLegacy=1">';
    localStorage.setItem('todos', JSON.stringify([payload]));
    await boot(createServer());

    expect(titles()).toEqual([payload]);
    expect($('.todo-list img')).toBeNull();
    expect(window.pwnedLegacy).toBeUndefined();
  });

  it.each(['network', 'lost'])(
    'AC-7: a failed 2nd of 3 imports (%s) keeps items 2-3; the next load completes with no duplicates',
    async (mode) => {
      localStorage.setItem('todos', JSON.stringify(['A', 'B', 'C']));
      const server = createServer([], { failPost: (_body, i) => (i === 1 ? mode : null) });

      await boot(server);

      const kept = JSON.parse(localStorage.getItem('todos'));
      expect(kept.map((t) => t.title)).toEqual(['B', 'C']);
      expect(notice().hidden).toBe(false);
      expect(noticeText()).toBe('Could not import 2 task(s) from the previous version; will retry next time.');
      expect(titles()).toEqual(mode === 'lost' ? ['A', 'B'] : ['A']);

      await boot(server);

      expect(localStorage.getItem('todos')).toBeNull();
      expect(server.todos.map((t) => t.title)).toEqual(['A', 'B', 'C']);
      expect(server.todos.slice(1).map((t) => t.id)).toEqual(kept.map((t) => t.id));
      expect(titles()).toEqual(['A', 'B', 'C']);
      expect(noticeText()).toBe('Imported 2 task(s) from the previous version');
    },
  );

  it.each(['{oops', '{}'])('AC-8: leaves the corrupt legacy value %p untouched and still loads', async (raw) => {
    localStorage.setItem('todos', raw);
    const server = createServer([{ title: 'Server task' }]);

    await boot(server);

    expect(localStorage.getItem('todos')).toBe(raw);
    expect(posts(server)).toHaveLength(0);
    expect(titles()).toEqual(['Server task']);
    expect(notice().hidden).toBe(true);
  });

  it('AC-8: imports the valid entries of [1, null, "", "ok"] and reports the skipped ones', async () => {
    localStorage.setItem('todos', JSON.stringify([1, null, '', 'ok']));
    const server = createServer();

    await boot(server);

    expect(posts(server).map((p) => p.body.title)).toEqual(['ok']);
    expect(titles()).toEqual(['ok']);
    expect(localStorage.getItem('todos')).toBeNull();
    expect(noticeText()).toBe('Imported 1 task(s) from the previous version; skipped 3 invalid entr(ies)');
  });

  it('EH-6: the app still loads when localStorage access throws', async () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    try {
      const server = createServer([{ title: 'Still here' }]);
      await boot(server);
      expect(titles()).toEqual(['Still here']);
      expect(posts(server)).toHaveLength(0);
      expect(notice().hidden).toBe(true);
      expect(document.body.className).toBe('standard');
    } finally {
      spy.mockRestore();
    }
  });

  describe('with navigator.locks (FR-14)', () => {
    afterEach(() => {
      delete navigator.locks;
    });

    it('N-2 / R-1 / AC-12: with a legacy key, shows a checking notice while waiting for the lock, then the result', async () => {
      localStorage.setItem('todos', JSON.stringify(['A']));
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const locks = {
        request: jest.fn(async (name, callback) => {
          await gate;
          return callback({ name });
        }),
      };
      Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
      const server = createServer();

      await boot(server);
      expect(notice().hidden).toBe(false);
      expect(noticeText()).toBe('Checking for tasks from the previous version…');
      expect(server.calls).toHaveLength(0);

      release();
      await settle();

      expect(locks.request).toHaveBeenCalledWith('todos-legacy-import', expect.any(Function));
      expect(noticeText()).toBe('Imported 1 task(s) from the previous version');
      expect(titles()).toEqual(['A']);
    });

    it('N-2 / R-1: never shows the checking notice when there is no legacy key', async () => {
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const locks = {
        request: jest.fn(async (name, callback) => {
          await gate;
          return callback({ name });
        }),
      };
      Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
      const server = createServer([{ title: 'Only server' }]);

      await boot(server);
      // Still waiting for the lock: nothing to import, so nothing to explain.
      expect(locks.request).toHaveBeenCalledTimes(1);
      expect(notice().hidden).toBe(true);
      expect(noticeText()).toBe('');

      release();
      await settle();

      expect(notice().hidden).toBe(true);
      expect(noticeText()).toBe('');
      expect(titles()).toEqual(['Only server']);
    });

    it('R-1: a storage peek that throws skips the checking notice and the app still loads', async () => {
      const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      const locks = { request: jest.fn(async (name, callback) => callback({ name })) };
      Object.defineProperty(navigator, 'locks', { value: locks, configurable: true });
      try {
        await boot(createServer([{ title: 'Only server' }]));
        expect(noticeText()).toBe('');
        expect(titles()).toEqual(['Only server']);
      } finally {
        spy.mockRestore();
      }
    });
  });
});
