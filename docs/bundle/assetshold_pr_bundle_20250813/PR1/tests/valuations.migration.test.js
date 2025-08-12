const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

test('valuations has unit_price_jpy column after migration', done => {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'portfolio.db');
  const db = new sqlite3.Database(dbPath);
  db.all(`PRAGMA table_info(valuations);`, (err, rows) => {
    if (err) throw err;
    const has = rows.some(r => r.name === 'unit_price_jpy');
    expect(has).toBe(true);
    db.close(); done();
  });
});
