/**
 * Simple SQLite migration runner.
 * Usage: node scripts/apply-migrations.js
 */
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'portfolio.db');
const MIG_DIR = path.join(__dirname, '..', 'migrations');

function getUserVersion(db) {
  return new Promise((resolve, reject) => {
    db.get('PRAGMA user_version;', (err, row) => {
      if (err) return reject(err);
      resolve(row.user_version || 0);
    });
  });
}

function setUserVersion(db, ver) {
  return new Promise((resolve, reject) => {
    db.exec(`PRAGMA user_version = ${ver};`, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function execSQL(db, sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

(async () => {
  if (!fs.existsSync(DB_PATH)) {
    console.error('DB not found:', DB_PATH);
    process.exit(1);
  }
  const db = new sqlite3.Database(DB_PATH);
  try {
    const files = fs.readdirSync(MIG_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort(); // chronological if named properly
    let version = await getUserVersion(db);
    // naive: apply all sql files > version by index
    for (let i = 0; i < files.length; i++) {
      const targetVersion = i + 1;
      const file = files[i];
      if (targetVersion <= version) continue;
      const sql = fs.readFileSync(path.join(MIG_DIR, file), 'utf-8');
      console.log(`Applying migration #${targetVersion}: ${file}`);
      await execSQL(db, sql);
      await setUserVersion(db, targetVersion);
    }
    console.log('Migrations complete. user_version =', await getUserVersion(db));
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  } finally {
    db.close();
  }
})();