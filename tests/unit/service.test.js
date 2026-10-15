const { createTodoService } = require('../../backend/src/services/todoService');
const { ValidationError, NotFoundError, ConflictError } = require('../../backend/src/errors');
const { UUID_V4_RE } = require('../../backend/src/validation');

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ID1 = uid(1);
const ID5 = uid(5);
const ID7 = uid(7);
const CLIENT_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function createFakeRepository() {
  const rows = new Map();
  return {
    rows,
    findAll: jest.fn(() => Array.from(rows.values())),
    findById: jest.fn((id) => rows.get(id) || null),
    create: jest.fn((input, now) => {
      if (rows.has(input.id)) throw new ConflictError(`Todo ${input.id} already exists`);
      const todo = { ...input, createdAt: now, updatedAt: now };
      rows.set(todo.id, todo);
      return todo;
    }),
    update: jest.fn((id, input, now) => {
      if (!rows.has(id)) return null;
      const todo = { ...rows.get(id), ...input, updatedAt: now };
      rows.set(id, todo);
      return todo;
    }),
    delete: jest.fn((id) => rows.delete(id)),
    deleteCompleted: jest.fn(() => 3),
  };
}

describe('todoService', () => {
  let repository;
  let service;

  beforeEach(() => {
    repository = createFakeRepository();
    service = createTodoService({ repository, now: () => '2030-01-01T00:00:00.000Z', newId: () => ID1 });
  });

  it('create applies defaults, trims and stamps the time', () => {
    const todo = service.create({ title: ' Hello ' });
    expect(repository.create).toHaveBeenCalledWith(
      { id: ID1, title: 'Hello', completed: false, priority: 'medium', dueDate: null },
      '2030-01-01T00:00:00.000Z',
    );
    expect(todo.id).toBe(ID1);
  });

  it('AC-5: create keeps the client-supplied id instead of generating one', () => {
    const newId = jest.fn(() => ID1);
    service = createTodoService({ repository, newId });
    expect(service.create({ id: CLIENT_ID, title: 'Mine' }).id).toBe(CLIENT_ID);
    expect(newId).not.toHaveBeenCalled();
  });

  it('FR-3: create generates a v4 UUID with node:crypto when none is given', () => {
    service = createTodoService({ repository });
    expect(service.create({ title: 'Generated' }).id).toMatch(UUID_V4_RE);
  });

  it('EH-1: create rejects a malformed id before reaching the repository', () => {
    expect(() => service.create({ id: 'abc', title: 'A' })).toThrow(ValidationError);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('EH-2: create surfaces a duplicate id as ConflictError', () => {
    service.create({ id: CLIENT_ID, title: 'First' });
    expect(() => service.create({ id: CLIENT_ID, title: 'Second' })).toThrow(ConflictError);
    expect(repository.rows.get(CLIENT_ID).title).toBe('First');
  });

  it('create does not reach the repository when validation fails', () => {
    expect(() => service.create({ title: '' })).toThrow(ValidationError);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('list validates the query and forwards parsed filters', () => {
    service.list({ status: 'active', q: ' x ' });
    expect(repository.findAll).toHaveBeenCalledWith({ status: 'active', q: 'x' });
    expect(() => service.list({ status: 'nope' })).toThrow(ValidationError);
  });

  it('get throws NotFoundError for a missing todo', () => {
    expect(() => service.get(ID5)).toThrow(NotFoundError);
  });

  it('get throws ValidationError for a bad id before touching the repository', () => {
    expect(() => service.get('abc')).toThrow(ValidationError);
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('EH-3: get rejects a legacy integer id with ValidationError', () => {
    expect(() => service.get('5')).toThrow(ValidationError);
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('update merges changes with the existing todo', () => {
    service.create({ title: 'A', priority: 'high', dueDate: '2030-03-03' });
    service.update(ID1, { completed: true });
    expect(repository.update).toHaveBeenCalledWith(
      ID1,
      { title: 'A', completed: true, priority: 'high', dueDate: '2030-03-03' },
      '2030-01-01T00:00:00.000Z',
    );
  });

  it('update can clear dueDate', () => {
    service.create({ title: 'A', dueDate: '2030-03-03' });
    service.update(ID1, { dueDate: null });
    expect(repository.update.mock.calls[0][1].dueDate).toBeNull();
  });

  it('update throws NotFoundError for a missing todo', () => {
    expect(() => service.update(ID7, { completed: true })).toThrow(NotFoundError);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('remove throws NotFoundError for a missing todo', () => {
    expect(() => service.remove(ID7)).toThrow(NotFoundError);
    service.create({ title: 'A' });
    expect(() => service.remove(ID1)).not.toThrow();
  });

  it('clearCompleted requires the literal string "true"', () => {
    expect(service.clearCompleted('true')).toBe(3);
    expect(() => service.clearCompleted(undefined)).toThrow(ValidationError);
    expect(() => service.clearCompleted('false')).toThrow(ValidationError);
    expect(repository.deleteCompleted).toHaveBeenCalledTimes(1);
  });
});
