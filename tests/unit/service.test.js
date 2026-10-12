const { createTodoService } = require('../../backend/src/services/todoService');
const { ValidationError, NotFoundError } = require('../../backend/src/errors');

function createFakeRepository() {
  const rows = new Map();
  let nextId = 1;
  return {
    rows,
    findAll: jest.fn(() => Array.from(rows.values())),
    findById: jest.fn((id) => rows.get(id) || null),
    create: jest.fn((input, now) => {
      const todo = { id: nextId++, ...input, createdAt: now, updatedAt: now };
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
    service = createTodoService({ repository, now: () => '2030-01-01T00:00:00.000Z' });
  });

  it('create applies defaults, trims and stamps the time', () => {
    const todo = service.create({ title: ' Hello ' });
    expect(repository.create).toHaveBeenCalledWith(
      { title: 'Hello', completed: false, priority: 'medium', dueDate: null },
      '2030-01-01T00:00:00.000Z',
    );
    expect(todo.id).toBe(1);
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
    expect(() => service.get('5')).toThrow(NotFoundError);
  });

  it('get throws ValidationError for a bad id before touching the repository', () => {
    expect(() => service.get('abc')).toThrow(ValidationError);
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('update merges changes with the existing todo', () => {
    service.create({ title: 'A', priority: 'high', dueDate: '2030-03-03' });
    service.update('1', { completed: true });
    expect(repository.update).toHaveBeenCalledWith(
      1,
      { title: 'A', completed: true, priority: 'high', dueDate: '2030-03-03' },
      '2030-01-01T00:00:00.000Z',
    );
  });

  it('update can clear dueDate', () => {
    service.create({ title: 'A', dueDate: '2030-03-03' });
    service.update('1', { dueDate: null });
    expect(repository.update.mock.calls[0][1].dueDate).toBeNull();
  });

  it('update throws NotFoundError for a missing todo', () => {
    expect(() => service.update('7', { completed: true })).toThrow(NotFoundError);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('remove throws NotFoundError for a missing todo', () => {
    expect(() => service.remove('7')).toThrow(NotFoundError);
    service.create({ title: 'A' });
    expect(() => service.remove('1')).not.toThrow();
  });

  it('clearCompleted requires the literal string "true"', () => {
    expect(service.clearCompleted('true')).toBe(3);
    expect(() => service.clearCompleted(undefined)).toThrow(ValidationError);
    expect(() => service.clearCompleted('false')).toThrow(ValidationError);
    expect(repository.deleteCompleted).toHaveBeenCalledTimes(1);
  });
});
