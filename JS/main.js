(function () {
  const THEMES = ['standard', 'light', 'darker'];
  const THEME_KEY = 'savedTheme';
  const SEARCH_DEBOUNCE_MS = 250;
  const FALL_FALLBACK_MS = 600;

  const els = {
    form: document.getElementById('todo-form'),
    input: document.querySelector('.todo-input'),
    priority: document.getElementById('priority-input'),
    due: document.getElementById('due-input'),
    formMessage: document.getElementById('form-message'),
    appMessage: document.getElementById('app-message'),
    list: document.querySelector('.todo-list'),
    search: document.getElementById('search-input'),
    clearCompleted: document.getElementById('clear-completed'),
    filterButtons: Array.from(document.querySelectorAll('.filter-btn')),
    themeButtons: Array.from(document.querySelectorAll('.theme-selector')),
    title: document.getElementById('title'),
  };

  const state = {
    todos: [],
    filter: 'all',
    query: '',
    editingId: null,
    theme: 'standard',
    loadSeq: 0,
    loaded: false,
  };

  // ---------- helpers ----------

  function create(tag, { className, text, testid, attrs } = {}) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    if (testid) node.setAttribute('data-testid', testid);
    if (attrs) Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  }

  function iconButton({ className, testid, label, icon, pressed }) {
    const button = create('button', {
      className: `${className} ${state.theme}-button`,
      testid,
      attrs: { type: 'button', 'aria-label': label, title: label },
    });
    if (pressed !== undefined) button.setAttribute('aria-pressed', String(pressed));
    button.appendChild(create('i', { className: `fas ${icon}`, attrs: { 'aria-hidden': 'true' } }));
    return button;
  }

  function applyThemeClass(node, kind, color) {
    THEMES.forEach((theme) => node.classList.remove(`${theme}-${kind}`));
    node.classList.add(`${color}-${kind}`);
  }

  function showMessage(node, text) {
    node.textContent = text;
    node.hidden = false;
  }

  function clearMessage(node) {
    node.textContent = '';
    node.hidden = true;
  }

  function todayString() {
    const now = new Date();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${now.getFullYear()}-${month}-${day}`;
  }

  // ---------- theme ----------

  function readStoredTheme() {
    try {
      const stored = localStorage.getItem(THEME_KEY);
      return THEMES.includes(stored) ? stored : 'standard';
    } catch (error) {
      return 'standard';
    }
  }

  function setTheme(color) {
    try {
      localStorage.setItem(THEME_KEY, color);
    } catch (error) {
      // Storage unavailable: theme still applies for this session.
    }
    state.theme = color;
    document.body.className = color;
    els.title.classList.toggle('darker-title', color === 'darker');

    document
      .querySelectorAll('.todo-input, #priority-input, #due-input, #search-input')
      .forEach((node) => applyThemeClass(node, 'input', color));
    document
      .querySelectorAll('.todo-btn, .filter-btn, .clear-btn')
      .forEach((node) => applyThemeClass(node, 'button', color));
    els.themeButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.theme === color));
    });

    renderList();
  }

  // ---------- rendering ----------

  function renderMeta(todo) {
    const meta = create('div', { className: 'todo-meta' });
    meta.appendChild(
      create('span', {
        className: `priority-badge priority-${todo.priority}`,
        text: todo.priority,
        testid: 'priority-badge',
      }),
    );
    if (todo.dueDate) {
      const overdue = !todo.completed && todo.dueDate < todayString();
      meta.appendChild(
        create('span', {
          className: `todo-due${overdue ? ' overdue' : ''}`,
          text: `Due ${todo.dueDate}`,
          testid: 'due-date',
        }),
      );
    }
    return meta;
  }

  function renderViewRow(li, todo) {
    const body = create('div', { className: 'todo-body' });
    body.appendChild(create('span', { className: 'todo-title', text: todo.title, testid: 'todo-title' }));
    body.appendChild(renderMeta(todo));
    li.appendChild(body);

    li.appendChild(
      iconButton({
        className: 'check-btn',
        testid: 'check-btn',
        label: `${todo.completed ? 'Mark as active' : 'Mark as completed'}: ${todo.title}`,
        icon: 'fa-check',
        pressed: todo.completed,
      }),
    );
    li.appendChild(
      iconButton({ className: 'edit-btn', testid: 'edit-btn', label: `Edit task: ${todo.title}`, icon: 'fa-edit' }),
    );
    li.appendChild(
      iconButton({ className: 'delete-btn', testid: 'delete-btn', label: `Delete task: ${todo.title}`, icon: 'fa-trash' }),
    );
  }

  function renderEditRow(li, todo) {
    const fields = create('div', { className: 'todo-edit' });

    const title = create('input', {
      className: `edit-title ${state.theme}-input`,
      testid: 'edit-input',
      attrs: { type: 'text', maxlength: '200', 'aria-label': 'Task title', autocomplete: 'off' },
    });
    title.value = todo.title;

    const priority = create('select', {
      className: `edit-priority ${state.theme}-input`,
      testid: 'edit-priority',
      attrs: { 'aria-label': 'Priority' },
    });
    ['low', 'medium', 'high'].forEach((value) => {
      const option = create('option', { text: value.charAt(0).toUpperCase() + value.slice(1), attrs: { value } });
      priority.appendChild(option);
    });
    priority.value = todo.priority;

    const due = create('input', {
      className: `edit-due ${state.theme}-input`,
      testid: 'edit-due',
      attrs: { type: 'date', 'aria-label': 'Due date' },
    });
    due.value = todo.dueDate || '';

    const error = create('p', {
      className: 'form-message edit-error',
      testid: 'edit-error',
      attrs: { role: 'alert', hidden: '' },
    });

    fields.append(title, priority, due, error);
    li.appendChild(fields);
    li.appendChild(iconButton({ className: 'save-btn', testid: 'save-btn', label: 'Save changes', icon: 'fa-save' }));
    li.appendChild(iconButton({ className: 'cancel-btn', testid: 'cancel-btn', label: 'Cancel editing', icon: 'fa-times' }));
    return title;
  }

  function renderTodo(todo) {
    const editing = state.editingId === todo.id;
    const li = create('li', {
      className: `todo ${state.theme}-todo${todo.completed ? ' completed' : ''}`,
      testid: 'todo-item',
    });
    li.dataset.id = String(todo.id);
    if (editing) {
      li.classList.add('editing');
      renderEditRow(li, todo);
    } else {
      renderViewRow(li, todo);
    }
    return li;
  }

  function renderList() {
    els.list.replaceChildren();
    if (!state.loaded) return;
    if (state.todos.length === 0) {
      const hasFilter = state.filter !== 'all' || state.query !== '';
      els.list.appendChild(
        create('li', {
          className: 'todo-empty',
          text: hasFilter ? 'No tasks match.' : 'No tasks yet. Add one above.',
          testid: 'empty-state',
        }),
      );
      return;
    }
    state.todos.forEach((todo) => els.list.appendChild(renderTodo(todo)));

    if (state.editingId !== null) {
      const editInput = els.list.querySelector('.editing .edit-title');
      if (editInput) editInput.focus();
    }
  }

  // ---------- data ----------

  async function loadTodos() {
    const seq = ++state.loadSeq;
    try {
      const todos = await TodoApi.list({ status: state.filter, q: state.query });
      if (seq !== state.loadSeq) return;
      state.todos = todos;
      state.loaded = true;
      if (state.editingId !== null && !todos.some((todo) => todo.id === state.editingId)) {
        state.editingId = null;
      }
      clearMessage(els.appMessage);
      renderList();
    } catch (error) {
      if (seq === state.loadSeq) showMessage(els.appMessage, error.message);
    }
  }

  async function guarded(action) {
    try {
      await action();
    } catch (error) {
      showMessage(els.appMessage, error.message);
    }
  }

  async function addTodo(event) {
    event.preventDefault();
    const title = els.input.value.trim();
    if (title === '') {
      els.input.value = '';
      showMessage(els.formMessage, 'Please enter a task before adding it.');
      els.input.focus();
      return;
    }
    try {
      await TodoApi.create({
        title,
        priority: els.priority.value,
        dueDate: els.due.value || null,
      });
    } catch (error) {
      showMessage(els.formMessage, error.message);
      return;
    }
    clearMessage(els.formMessage);
    els.input.value = '';
    els.due.value = '';
    els.input.focus();
    await guarded(loadTodos);
  }

  function findTodo(li) {
    const id = Number(li.dataset.id);
    return state.todos.find((todo) => todo.id === id);
  }

  async function toggleTodo(todo) {
    await TodoApi.update(todo.id, { completed: !todo.completed });
    await loadTodos();
  }

  async function deleteTodo(todo, li) {
    await TodoApi.remove(todo.id);
    if (state.editingId === todo.id) state.editingId = null;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      loadTodos();
    };
    li.addEventListener('transitionend', finish, { once: true });
    li.classList.add('fall');
    setTimeout(finish, FALL_FALLBACK_MS);
  }

  async function saveEdit(todo, li) {
    const error = li.querySelector('.edit-error');
    const title = li.querySelector('.edit-title').value.trim();
    if (title === '') {
      showMessage(error, 'Task cannot be empty.');
      li.querySelector('.edit-title').focus();
      return;
    }
    try {
      await TodoApi.update(todo.id, {
        title,
        priority: li.querySelector('.edit-priority').value,
        dueDate: li.querySelector('.edit-due').value || null,
      });
    } catch (err) {
      showMessage(error, err.message);
      return;
    }
    state.editingId = null;
    await loadTodos();
  }

  // ---------- events ----------

  els.form.addEventListener('submit', addTodo);

  els.list.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    const li = button && button.closest('.todo');
    if (!li) return;
    const todo = findTodo(li);
    if (!todo) return;

    if (button.classList.contains('check-btn')) {
      guarded(() => toggleTodo(todo));
    } else if (button.classList.contains('delete-btn')) {
      guarded(() => deleteTodo(todo, li));
    } else if (button.classList.contains('edit-btn')) {
      state.editingId = todo.id;
      renderList();
    } else if (button.classList.contains('save-btn')) {
      guarded(() => saveEdit(todo, li));
    } else if (button.classList.contains('cancel-btn')) {
      state.editingId = null;
      renderList();
    }
  });

  els.list.addEventListener('keydown', (event) => {
    if (!event.target.classList.contains('edit-title')) return;
    const li = event.target.closest('.todo');
    const todo = li && findTodo(li);
    if (!todo) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      guarded(() => saveEdit(todo, li));
    } else if (event.key === 'Escape') {
      state.editingId = null;
      renderList();
    }
  });

  els.filterButtons.forEach((button) => {
    button.addEventListener('click', () => {
      state.filter = button.dataset.filter;
      els.filterButtons.forEach((other) => {
        other.setAttribute('aria-pressed', String(other === button));
      });
      loadTodos();
    });
  });

  let searchTimer = null;
  els.search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = els.search.value.trim();
      loadTodos();
    }, SEARCH_DEBOUNCE_MS);
  });

  els.clearCompleted.addEventListener('click', () => {
    guarded(async () => {
      await TodoApi.clearCompleted();
      await loadTodos();
    });
  });

  els.themeButtons.forEach((button) => {
    button.addEventListener('click', () => setTheme(button.dataset.theme));
  });

  // ---------- init ----------

  setTheme(readStoredTheme());
  loadTodos();
})();
