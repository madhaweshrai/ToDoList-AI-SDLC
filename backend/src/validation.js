const { ValidationError } = require('./errors');

const PRIORITIES = ['low', 'medium', 'high'];
const STATUSES = ['all', 'active', 'completed'];
const TITLE_MAX = 200;
const QUERY_MAX = 200;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseId(raw) {
  if (typeof raw !== 'string' || !/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) {
    throw new ValidationError('Invalid todo id', [{ field: 'id', message: 'must be a positive integer' }]);
  }
  return Number(raw);
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

function parseBody(body, { requireTitle }) {
  if (!isPlainObject(body)) {
    throw new ValidationError('Request body must be a JSON object');
  }
  const errors = [];
  const result = {};

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

const parseCreateBody = (body) => parseBody(body, { requireTitle: true });
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
  parseId,
  parseCreateBody,
  parseUpdateBody,
  parseListQuery,
};
