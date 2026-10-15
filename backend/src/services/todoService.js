const { randomUUID } = require('node:crypto');
const { NotFoundError, ValidationError } = require('../errors');
const {
  parseId,
  parseCreateBody,
  parseUpdateBody,
  parseListQuery,
} = require('../validation');

function createTodoService({ repository, now = () => new Date().toISOString(), newId = randomUUID }) {
  function requireTodo(id) {
    const todo = repository.findById(id);
    if (!todo) throw new NotFoundError(`Todo ${id} not found`);
    return todo;
  }

  return {
    list(query) {
      return repository.findAll(parseListQuery(query));
    },

    get(rawId) {
      return requireTodo(parseId(rawId));
    },

    create(body) {
      const input = parseCreateBody(body);
      return repository.create(
        {
          id: input.id ?? newId(),
          title: input.title,
          completed: input.completed ?? false,
          priority: input.priority ?? 'medium',
          dueDate: input.dueDate ?? null,
        },
        now(),
      );
    },

    update(rawId, body) {
      const id = parseId(rawId);
      const changes = parseUpdateBody(body);
      const existing = requireTodo(id);
      const merged = {
        title: changes.title ?? existing.title,
        completed: changes.completed ?? existing.completed,
        priority: changes.priority ?? existing.priority,
        dueDate: changes.dueDate !== undefined ? changes.dueDate : existing.dueDate,
      };
      const updated = repository.update(id, merged, now());
      if (!updated) throw new NotFoundError(`Todo ${id} not found`);
      return updated;
    },

    remove(rawId) {
      const id = parseId(rawId);
      if (!repository.delete(id)) throw new NotFoundError(`Todo ${id} not found`);
    },

    clearCompleted(completedFlag) {
      if (completedFlag !== 'true') {
        throw new ValidationError('Bulk delete requires ?completed=true', [
          { field: 'completed', message: 'must be "true"' },
        ]);
      }
      return repository.deleteCompleted();
    },
  };
}

module.exports = { createTodoService };
