const path = require('path');

const rootDir = path.resolve(__dirname, '..', '..');

module.exports = {
  rootDir,
  port: Number(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || path.join(rootDir, 'data', 'todos.db'),
};
