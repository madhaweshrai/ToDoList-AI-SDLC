const fs = require('fs');
const path = require('path');
const { dbPath } = require('../backend/src/config');
const { openDatabase } = require('../backend/src/db');

const db = openDatabase(dbPath);
db.exec(fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8'));
const { count } = db.prepare('SELECT COUNT(*) AS count FROM todos').get();
db.close();

console.log(`Database ready at ${dbPath} (${count} todos)`);
