/**
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const indexHtml = read('index.html');
const scripts = { api: read('JS/api.js'), time: read('JS/time.js'), main: read('JS/main.js') };

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const byTestId = (id, scope = document) => scope.querySelector(`[data-testid="${id}"]`);
const allByTestId = (id, scope = document) => Array.from(scope.querySelectorAll(`[data-testid="${id}"]`));

function createServer(initial = []) {
  const todos = initial.map((todo, index) => ({
    id: index + 1,
    title: todo.title,
    completed: Boolean(todo.completed),
    priority: todo.priority || 'medium',
    dueDate: todo.dueDate || null,
  }));
  let nextId = todos.length + 1;
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
    const idMatch = parsed.pathname.match(/^\/api\/todos\/(\d+)$/);

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
        const todo = { id: nextId++, completed: false, priority: 'medium', dueDate: null, ...body };
        todos.push(todo);
        return reply(201, { ...todo });
      }
      if (method === 'DELETE' && parsed.searchParams.get('completed') === 'true') {
        const before = todos.length;
        for (let i = todos.length - 1; i >= 0; i -= 1) if (todos[i].completed) todos.splice(i, 1);
        return reply(200, { deleted: before - todos.length });
      }
    }
    if (idMatch) {
      const index = todos.findIndex((t) => t.id === Number(idMatch[1]));
      if (index === -1) return reply(404, { error: { message: 'Todo not found' } });
      if (method === 'PUT') {
        Object.assign(todos[index], body);
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
  (0, eval)(scripts.main);
  await settle();
}

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
    expect(post.body).toEqual({ title: 'Buy milk', priority: 'high', dueDate: '2031-04-05' });
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
    expect(put.url).toBe('/api/todos/1');
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
  it('deletes by id, not by text, when titles are duplicated', async () => {
    const server = createServer([{ title: 'Same' }, { title: 'Same' }]);
    await boot(server);

    allByTestId('delete-btn')[1].click();
    await settle();
    await wait(700);

    const del = server.calls.find((call) => call.method === 'DELETE');
    expect(del.url).toBe('/api/todos/2');
    expect(server.todos.map((t) => t.id)).toEqual([1]);
    expect(allByTestId('todo-item')).toHaveLength(1);
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
