const path = require('path');
const express = require('express');
const { rootDir } = require('./config');
const { NotFoundError } = require('./errors');
const { createTodoRepository } = require('./repositories/todoRepository');
const { createTodoService } = require('./services/todoService');
const { createTodosRouter } = require('./routes/todos');

function createApp({ db, service } = {}) {
  const todoService = service || createTodoService({ repository: createTodoRepository(db) });
  const app = express();

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/api/todos', createTodosRouter(todoService));
  app.use('/api', (req, res, next) => {
    next(new NotFoundError(`Route ${req.method} ${req.originalUrl} not found`));
  });

  for (const dir of ['CSS', 'JS', 'assets']) {
    app.use(`/${dir}`, express.static(path.join(rootDir, dir)));
  }
  app.get(['/', '/index.html'], (req, res) => {
    res.sendFile(path.join(rootDir, 'index.html'));
  });

  app.use((req, res, next) => {
    next(new NotFoundError('Not found'));
  });

  app.use((err, req, res, next) => {
    const isBodyError = err.type === 'entity.parse.failed' || err.type === 'entity.too.large';
    if (isBodyError) {
      const status = err.type === 'entity.too.large' ? 413 : 400;
      const message = status === 413 ? 'Request body too large' : 'Malformed JSON body';
      return res.status(status).json({ error: { message } });
    }
    if (err.status && err.status < 500) {
      const body = { message: err.message };
      if (err.details) body.details = err.details;
      return res.status(err.status).json({ error: body });
    }
    console.error(err);
    return res.status(500).json({ error: { message: 'Internal server error' } });
  });

  return app;
}

module.exports = { createApp };
