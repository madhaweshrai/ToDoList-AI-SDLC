const { ValidationError } = require('./errors');

const PRIORITIES = ['low', 'medium', 'high'];
const STATUSES = ['all', 'active', 'completed'];
const TITLE_MAX = 200;
const QUERY_MAX = 200;
// Single server-side source for the id format. JS/todo-model.js mirrors it (a parity test guards drift).
const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const isUuidV4 = (value) => typeof value === 'string' && UUID_V4_RE.test(value);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const ID_ERROR = { field: 'id', message: 'must be a lowercase v4 UUID' };

/** Returns the raw path id unchanged when it is a lowercase v4 UUID. Never coerces. */
function parseId(raw) {
  if (!isUuidV4(raw)) {
    throw new ValidationError('Invalid todo id', [{ ...ID_ERROR }]);
  }
  return raw;
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function checkTitle(value, errors) {
  if (typeof value !== 'string') {
    errors.push({ field: 'title', message: 'must be a string' });
    return undefined;
  }
  const title = value.trim();
  const length = [...title].length;
  if (length < 1 || length > TITLE_MAX) {
    errors.push({ field: 'title', message: `must be between 1 and ${TITLE_MAX} characters` });
    return undefined;
  }
  return title;
}

function checkCompleted(value, errors) {
  if (typeof value !== 'boolean') {
    errors.push({ field: 'completed', message: 'must be a boolean' });
    return undefined;
  }
  return value;
}

function checkPriority(value, errors) {
  if (!PRIORITIES.includes(value)) {
    errors.push({ field: 'priority', message: `must be one of: ${PRIORITIES.join(', ')}` });
    return undefined;
  }
  return value;
}

function checkDueDate(value, errors) {
  if (value === null) return null;
  if (!isValidDate(value)) {
    errors.push({ field: 'dueDate', message: 'must be a valid date in YYYY-MM-DD format or null' });
    return undefined;
  }
  return value;
}

/**
 * @typedef {object} CreateTodoRequest
 * @property {string} [id]  lowercase v4 UUID; absent (undefined) lets the server generate one
 * @property {string} title
 * @property {boolean} [completed]
 * @property {'low'|'medium'|'high'} [priority]
 * @property {string|null} [dueDate]  YYYY-MM-DD
 */

function parseBody(body, { requireTitle, allowId = false }) {
  if (!isPlainObject(body)) {
    throw new ValidationError('Request body must be a JSON object');
  }
  const errors = [];
  const result = {};

  // Only `undefined` means "absent": an explicit null or a non-string id is a client error.
  if (allowId && body.id !== undefined) {
    if (isUuidV4(body.id)) {
      result.id = body.id;
    } else {
      errors.push({ ...ID_ERROR });
    }
  }
  if (body.title !== undefined || requireTitle) {
    const title = checkTitle(body.title, errors);
    if (title !== undefined) result.title = title;
  }
  if (body.completed !== undefined) {
    const completed = checkCompleted(body.completed, errors);
    if (completed !== undefined) result.completed = completed;
  }
  if (body.priority !== undefined) {
    const priority = checkPriority(body.priority, errors);
    if (priority !== undefined) result.priority = priority;
  }
  if (body.dueDate !== undefined) {
    const dueDate = checkDueDate(body.dueDate, errors);
    if (dueDate !== undefined) result.dueDate = dueDate;
  }

  if (errors.length === 0 && Object.keys(result).length === 0) {
    errors.push({ field: 'body', message: 'must contain at least one of: title, completed, priority, dueDate' });
  }
  if (errors.length > 0) {
    throw new ValidationError('Validation failed', errors);
  }
  return result;
}

const parseCreateBody = (body) => parseBody(body, { requireTitle: true, allowId: true });
const parseUpdateBody = (body) => parseBody(body, { requireTitle: false });

function parseListQuery(query = {}) {
  const errors = [];
  const filters = { status: 'all' };

  if (query.status !== undefined) {
    if (!STATUSES.includes(query.status)) {
      errors.push({ field: 'status', message: `must be one of: ${STATUSES.join(', ')}` });
    } else {
      filters.status = query.status;
    }
  }
  if (query.priority !== undefined) {
    if (!PRIORITIES.includes(query.priority)) {
      errors.push({ field: 'priority', message: `must be one of: ${PRIORITIES.join(', ')}` });
    } else {
      filters.priority = query.priority;
    }
  }
  if (query.q !== undefined) {
    if (typeof query.q !== 'string' || [...query.q].length > QUERY_MAX) {
      errors.push({ field: 'q', message: `must be a string of at most ${QUERY_MAX} characters` });
    } else if (query.q.trim() !== '') {
      filters.q = query.q.trim();
    }
  }

  if (errors.length > 0) {
    throw new ValidationError('Invalid query parameters', errors);
  }
  return filters;
}

module.exports = {
  PRIORITIES,
  STATUSES,
  TITLE_MAX,
  UUID_V4_RE,
  isUuidV4,
  parseId,
  parseCreateBody,
  parseUpdateBody,
  parseListQuery,
};
