/**
 * Todo domain model for the browser (EPMCDMETST-68130): id generation, id validation and legacy conversion.
 * No DOM, storage or network access. Exposes the global `TodoModel` and, under Node, `module.exports`.
 */
(function (global) {
  // Mirrors of backend/src/validation.js (no build step to share them); a parity test guards drift.
  const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const TITLE_MAX = 200;

  /**
   * @typedef {object} Todo
   * @property {string} id  lowercase v4 UUID
   * @property {string} title
   * @property {boolean} completed
   * @property {'low'|'medium'|'high'} priority
   * @property {string|null} dueDate
   * @property {string} createdAt
   * @property {string} updatedAt
   */

  /** 16 bytes -> 'xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx' with the version and variant bits set. */
  function formatV4(bytes) {
    const b = Array.from(bytes, (n) => n & 0xff);
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const hex = b.map((n) => n.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
  }

  /**
   * Lowercase v4 UUID: crypto.randomUUID, then crypto.getRandomValues, then Math.random (FR-2, EH-7).
   * `env` is read at call time so tests can inject or remove the generators.
   */
  function newId(env = { crypto: global.crypto, random: Math.random }) {
    const crypto = env.crypto;
    if (crypto && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID().toLowerCase();
    }
    if (crypto && typeof crypto.getRandomValues === 'function') {
      try {
        return formatV4(crypto.getRandomValues(new Uint8Array(16)));
      } catch (error) {
        // Some environments expose getRandomValues but throw (e.g. no entropy source): fall through.
      }
    }
    const random = typeof env.random === 'function' ? env.random : Math.random;
    return formatV4(Array.from({ length: 16 }, () => Math.floor(random() * 256)));
  }

  function isValidId(value) {
    return typeof value === 'string' && UUID_V4_RE.test(value);
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  /** Trimmed title of 1..TITLE_MAX code points (same rule as the server), otherwise null. */
  function cleanTitle(value) {
    if (typeof value !== 'string') return null;
    const title = value.trim();
    const length = [...title].length;
    return length >= 1 && length <= TITLE_MAX ? title : null;
  }

  function buildTodo({ id, title, completed, createdAt, now }) {
    return { id, title, completed, priority: 'medium', dueDate: null, createdAt, updatedAt: now };
  }

  /**
   * Converts one legacy localStorage entry to a Todo, or returns null when it is unusable (FR-10a, EH-5, EH-9).
   * A string becomes a new todo; a plain object keeps a valid (lowercased) id, a boolean completed and a string
   * createdAt. Only whitelisted fields are copied.
   */
  function fromLegacy(entry, now, generateId = newId) {
    if (typeof entry === 'string') {
      const title = cleanTitle(entry);
      return title === null ? null : buildTodo({ id: generateId(), title, completed: false, createdAt: now, now });
    }
    if (!isPlainObject(entry)) return null;

    const title = cleanTitle(entry.title) ?? cleanTitle(entry.text);
    if (title === null) return null;
    const lowerId = typeof entry.id === 'string' ? entry.id.toLowerCase() : null;
    return buildTodo({
      id: isValidId(lowerId) ? lowerId : generateId(),
      title,
      completed: typeof entry.completed === 'boolean' ? entry.completed : false,
      createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : now,
      now,
    });
  }

  /**
   * Converts a legacy array, preserving order. Unusable entries are counted in `skipped`. A repeated id
   * (compared after lowercasing, D-10b) is replaced with a fresh one so no item is lost to a 409.
   * @returns {{ todos: Todo[], skipped: number }}
   */
  function convertLegacy(list, now, generateId = newId) {
    const todos = [];
    let skipped = 0;
    const seen = new Set();
    (Array.isArray(list) ? list : []).forEach((entry) => {
      const todo = fromLegacy(entry, now, generateId);
      if (todo === null) {
        skipped += 1;
        return;
      }
      while (seen.has(todo.id)) todo.id = generateId();
      seen.add(todo.id);
      todos.push(todo);
    });
    return { todos, skipped };
  }

  const TodoModel = { UUID_V4_RE, TITLE_MAX, newId, isValidId, formatV4, fromLegacy, convertLegacy };
  global.TodoModel = TodoModel;
  if (typeof module !== 'undefined' && module.exports) module.exports = TodoModel;
})(typeof window !== 'undefined' ? window : globalThis);
