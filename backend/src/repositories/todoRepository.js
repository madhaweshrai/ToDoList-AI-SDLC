const { ConflictError } = require('../errors');

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

/** @returns {Todo} */
function toTodo(row) {
  return {
    id: row.id,
    title: row.title,
    completed: row.completed === 1,
    priority: row.priority,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function escapeLike(text) {
  return text.replace(/[\\%_]/g, (char) => `\\${char}`);
}

function createTodoRepository(db) {
  const selectById = db.prepare('SELECT * FROM todos WHERE id = ?');
  const insert = db.prepare(
    `INSERT INTO todos (id, title, completed, priority, due_date, created_at, updated_at)
     VALUES (@id, @title, @completed, @priority, @dueDate, @now, @now)`,
  );
  const update = db.prepare(
    `UPDATE todos
        SET title = @title, completed = @completed, priority = @priority,
            due_date = @dueDate, updated_at = @now
      WHERE id = @id`,
  );
  const deleteById = db.prepare('DELETE FROM todos WHERE id = ?');
  const deleteCompleted = db.prepare('DELETE FROM todos WHERE completed = 1');

  return {
    findAll({ status = 'all', priority, q } = {}) {
      const clauses = [];
      const params = [];
      if (status === 'active') clauses.push('completed = 0');
      if (status === 'completed') clauses.push('completed = 1');
      if (priority) {
        clauses.push('priority = ?');
        params.push(priority);
      }
      if (q) {
        clauses.push("title LIKE ? ESCAPE '\\'");
        params.push(`%${escapeLike(q)}%`);
      }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      // rowid breaks created_at ties in insertion order (ids are random, so they cannot order rows).
      const rows = db
        .prepare(`SELECT * FROM todos ${where} ORDER BY created_at ASC, rowid ASC`)
        .all(...params);
      return rows.map(toTodo);
    },

    findById(id) {
      const row = selectById.get(id);
      return row ? toTodo(row) : null;
    },

    create({ id, title, completed, priority, dueDate }, now) {
      try {
        insert.run({
          id,
          title,
          completed: completed ? 1 : 0,
          priority,
          dueDate,
          now,
        });
      } catch (err) {
        // Only a primary-key clash is a duplicate id; any other constraint failure stays a 500.
        if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY') {
          throw new ConflictError(`Todo ${id} already exists`);
        }
        throw err;
      }
      return this.findById(id);
    },

    update(id, { title, completed, priority, dueDate }, now) {
      const info = update.run({
        id,
        title,
        completed: completed ? 1 : 0,
        priority,
        dueDate,
        now,
      });
      return info.changes === 0 ? null : this.findById(id);
    },

    delete(id) {
      return deleteById.run(id).changes > 0;
    },

    deleteCompleted() {
      return deleteCompleted.run().changes;
    },
  };
}

module.exports = { createTodoRepository };
