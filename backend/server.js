const { port, dbPath } = require('./src/config');
const { openDatabase } = require('./src/db');
const { createApp } = require('./src/app');

const db = openDatabase(dbPath);
const server = createApp({ db }).listen(port, () => {
  console.log(`ToDoList listening on http://localhost:${port} (db: ${dbPath})`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
