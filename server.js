const express = require('express');
const path = require('path');
const session = require('express-session');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const chokidar = require('chokidar');
const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const multer = require('multer');

// MANDATORY PORT CHECK - Must fail if not port 3009
const REQUIRED_PORT = 3009;
const port = process.env.PORT || REQUIRED_PORT;

if (parseInt(port) !== REQUIRED_PORT) {
  console.error(`ERROR: This application MUST run on port ${REQUIRED_PORT}. Attempted port: ${port}`);
  console.error('Portfolio app requires fixed port 3009 for proper operation.');
  process.exit(1);
}

const app = express();

// Database initialization
const dbPath = path.join(__dirname, 'data', 'portfolio.db');
const db = new sqlite3.Database(dbPath);

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

app.use(session({
  secret: 'portfolio-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// Initialize database schema
function initDatabase() {
  db.serialize(() => {
    // Assets table (main)
    db.run(`CREATE TABLE IF NOT EXISTS assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class TEXT NOT NULL,
      name TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT "",
      acquired_at TEXT,
      book_value_jpy INTEGER NOT NULL,
      valuation_source TEXT NOT NULL DEFAULT 'manual',
      liquidity_tier TEXT NOT NULL,
      tags TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Valuations table
    db.run(`CREATE TABLE IF NOT EXISTS valuations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,
      as_of TEXT NOT NULL,
      value_jpy INTEGER NOT NULL,
      fx_context TEXT,
      FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
    )`);

    // US Stocks table
    db.run(`CREATE TABLE IF NOT EXISTS us_stocks (
      asset_id INTEGER PRIMARY KEY,
      ticker TEXT NOT NULL,
      exchange TEXT,
      quantity REAL NOT NULL,
      avg_price_usd REAL NOT NULL,
      FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
    )`);

    // JP Stocks table
    db.run(`CREATE TABLE IF NOT EXISTS jp_stocks (
      asset_id INTEGER PRIMARY KEY,
      code TEXT NOT NULL,
      quantity REAL NOT NULL,
      avg_price_jpy REAL NOT NULL,
      FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
    )`);

    // Watches table
    db.run(`CREATE TABLE IF NOT EXISTS watches (
      asset_id INTEGER PRIMARY KEY,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      ref TEXT,
      box_papers BOOLEAN DEFAULT 0,
      FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
    )`);

    // Precious metals table
    db.run(`CREATE TABLE IF NOT EXISTS precious_metals (
      asset_id INTEGER PRIMARY KEY,
      metal TEXT NOT NULL,
      weight_g REAL NOT NULL,
      purity REAL,
      FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
    )`);

    // Real estates table
    db.run(`CREATE TABLE IF NOT EXISTS real_estates (
      asset_id INTEGER PRIMARY KEY,
      address TEXT NOT NULL,
      land_area_sqm REAL,
      building_area_sqm REAL,
      rights TEXT,
      FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
    )`);

    // Collections table
    db.run(`CREATE TABLE IF NOT EXISTS collections (
      asset_id INTEGER PRIMARY KEY,
      category TEXT NOT NULL,
      variant TEXT,
      FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
    )`);

    // Cash table
    db.run(`CREATE TABLE IF NOT EXISTS cashes (
      asset_id INTEGER PRIMARY KEY,
      currency TEXT NOT NULL DEFAULT 'JPY',
      balance REAL NOT NULL,
      FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
    )`);

    // Audit log table
    db.run(`CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id INTEGER,
      action TEXT NOT NULL,
      old_values TEXT,
      new_values TEXT,
      user_id TEXT,
      source TEXT DEFAULT 'api',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Users table
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create default admin user if not exists
    db.get("SELECT id FROM users WHERE username = 'admin'", (err, row) => {
      if (!row) {
        bcrypt.hash('admin', 10, (err, hash) => {
          if (!err) {
            db.run("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", 
              ['admin', hash, 'admin']);
          }
        });
      }
    });
  });
}

// Authentication middleware
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Audit logging function
function logAudit(tableName, recordId, action, oldValues, newValues, userId, source = 'api') {
  const stmt = db.prepare(`INSERT INTO audit_log 
    (table_name, record_id, action, old_values, new_values, user_id, source) 
    VALUES (?, ?, ?, ?, ?, ?, ?)`);
  
  stmt.run(
    tableName,
    recordId,
    action,
    oldValues ? JSON.stringify(oldValues) : null,
    newValues ? JSON.stringify(newValues) : null,
    userId,
    source
  );
  stmt.finalize();
}

// Routes

// Authentication routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  db.get("SELECT * FROM users WHERE username = ?", [username], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    bcrypt.compare(password, user.password_hash, (err, match) => {
      if (err || !match) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      
      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role
      };
      
      res.json({ user: req.session.user });
    });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/user', (req, res) => {
  if (req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

// Dashboard route (accessible to all)
app.get('/api/dashboard', (req, res) => {
  const queries = {
    totalAssets: `SELECT COUNT(*) as count FROM assets`,
    totalValue: `SELECT SUM(book_value_jpy) as total FROM assets`,
    assetsByClass: `SELECT class, COUNT(*) as count, SUM(book_value_jpy) as total_value FROM assets GROUP BY class`,
    topAssets: `SELECT name, note, book_value_jpy FROM assets ORDER BY book_value_jpy DESC LIMIT 3`
  };
  
  const results = {};
  let completed = 0;
  const total = Object.keys(queries).length;
  
  Object.entries(queries).forEach(([key, query]) => {
    db.all(query, (err, rows) => {
      if (!err) {
        results[key] = rows;
      }
      completed++;
      
      if (completed === total) {
        res.json(results);
      }
    });
  });
});

// Assets CRUD routes
app.get('/api/assets', (req, res) => {
  const { class: assetClass } = req.query;
  let query = 'SELECT * FROM assets';
  let params = [];
  
  if (assetClass) {
    query += ' WHERE class = ?';
    params.push(assetClass);
  }
  
  query += ' ORDER BY created_at DESC';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.get('/api/assets/:id', (req, res) => {
  db.get('SELECT * FROM assets WHERE id = ?', [req.params.id], (err, row) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    res.json(row);
  });
});

app.post('/api/assets', requireAdmin, (req, res) => {
  const {
    class: assetClass,
    name,
    note = "",
    acquired_at,
    book_value_jpy,
    valuation_source = 'manual',
    liquidity_tier,
    tags
  } = req.body;
  
  // Validation
  if (!assetClass || !name || !book_value_jpy || !liquidity_tier) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const stmt = db.prepare(`INSERT INTO assets 
    (class, name, note, acquired_at, book_value_jpy, valuation_source, liquidity_tier, tags) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  
  stmt.run(
    assetClass, name, note, acquired_at, book_value_jpy, 
    valuation_source, liquidity_tier, tags,
    function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      const newAsset = {
        id: this.lastID,
        class: assetClass,
        name,
        note,
        acquired_at,
        book_value_jpy,
        valuation_source,
        liquidity_tier,
        tags
      };
      
      logAudit('assets', this.lastID, 'CREATE', null, newAsset, req.session.user.id);
      res.status(201).json(newAsset);
    }
  );
  stmt.finalize();
});

app.patch('/api/assets/:id', requireAdmin, (req, res) => {
  const assetId = req.params.id;
  
  // Get current values for audit
  db.get('SELECT * FROM assets WHERE id = ?', [assetId], (err, currentAsset) => {
    if (err || !currentAsset) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    
    const updates = {};
    const allowedFields = ['name', 'note', 'acquired_at', 'book_value_jpy', 'valuation_source', 'liquidity_tier', 'tags'];
    
    allowedFields.forEach(field => {
      if (req.body.hasOwnProperty(field)) {
        updates[field] = req.body[field];
      }
    });
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    // Special handling for note field - ensure empty string not null
    if (updates.hasOwnProperty('note') && !updates.note) {
      updates.note = "";
    }
    
    updates.updated_at = new Date().toISOString();
    
    const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(assetId);
    
    db.run(`UPDATE assets SET ${setClause} WHERE id = ?`, values, function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      const updatedAsset = { ...currentAsset, ...updates, id: parseInt(assetId) };
      logAudit('assets', assetId, 'UPDATE', currentAsset, updatedAsset, req.session.user.id);
      
      res.json(updatedAsset);
    });
  });
});

app.delete('/api/assets/:id', requireAdmin, (req, res) => {
  const assetId = req.params.id;
  
  // Get current values for audit
  db.get('SELECT * FROM assets WHERE id = ?', [assetId], (err, currentAsset) => {
    if (err || !currentAsset) {
      return res.status(404).json({ error: 'Asset not found' });
    }
    
    db.run('DELETE FROM assets WHERE id = ?', [assetId], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      logAudit('assets', assetId, 'DELETE', currentAsset, null, req.session.user.id);
      res.json({ success: true });
    });
  });
});

// CSV Import (File Upload)
app.post('/api/import/csv', requireAdmin, upload.single('csvFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'CSVファイルを選択してください' });
  }

  try {
    const csvContent = req.file.buffer.toString('utf-8');
    const results = [];
    
    // Parse CSV content
    const lines = csvContent.split('\n');
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSVファイルが空またはヘッダーのみです' });
    }
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const requiredHeaders = ['class', 'name', 'book_value_jpy', 'liquidity_tier'];
    
    // Validate headers
    for (const required of requiredHeaders) {
      if (!headers.includes(required)) {
        return res.status(400).json({ 
          error: `必須カラム '${required}' がありません`,
          details: `ヘッダーに以下の必須カラムを含めてください: ${requiredHeaders.join(', ')}`
        });
      }
    }
    
    // Process data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      if (values.length !== headers.length) {
        throw new Error(`行 ${i + 1}: カラム数が一致しません`);
      }
      
      const record = {};
      headers.forEach((header, idx) => {
        record[header] = values[idx];
      });
      
      // Validate required fields
      if (!record.class || !record.name || !record.book_value_jpy || !record.liquidity_tier) {
        throw new Error(`行 ${i + 1}: 必須項目が不足しています`);
      }
      
      // Parse numeric values - handle currency formats
      let bookValueStr = record.book_value_jpy.toString().trim();
      
      // Remove currency symbols, commas, and quotes
      bookValueStr = bookValueStr
        .replace(/[¥$€£,"""]/g, '')  // Remove currency symbols and commas
        .replace(/[^\d.-]/g, '');    // Keep only digits, dots, and minus
      
      const bookValue = parseInt(bookValueStr) || parseFloat(bookValueStr);
      if (isNaN(bookValue) || bookValue <= 0) {
        throw new Error(`行 ${i + 1}: 簿価が無効です (入力値: "${record.book_value_jpy}")`);
      }
      
      record.book_value_jpy = bookValue;
      record.note = record.note || '';
      record.valuation_source = record.valuation_source || 'manual';
      
      results.push(record);
    }
    
    if (results.length === 0) {
      return res.status(400).json({ error: 'インポート対象のデータがありません' });
    }
    
    // Begin transaction
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      try {
        let processedCount = 0;
        let insertedCount = 0;
        let updatedCount = 0;
        
        const processRecord = (record, callback) => {
          // Check if asset already exists
          db.get('SELECT id FROM assets WHERE class = ? AND name = ?', 
            [record.class, record.name], (err, existing) => {
            if (err) {
              return callback(err);
            }
            
            if (existing) {
              // Update existing record (Upsert)
              const stmt = db.prepare(`UPDATE assets SET 
                note = ?, acquired_at = ?, book_value_jpy = ?, 
                valuation_source = ?, liquidity_tier = ?, tags = ?, updated_at = ?
                WHERE id = ?`);
              
              stmt.run(
                record.note,
                record.acquired_at,
                record.book_value_jpy,
                record.valuation_source,
                record.liquidity_tier,
                record.tags,
                new Date().toISOString(),
                existing.id,
                (err) => {
                  if (!err) {
                    updatedCount++;
                    logAudit('assets', existing.id, 'UPDATE_CSV', null, record, 'system', 'csv_import');
                  }
                  callback(err);
                }
              );
              stmt.finalize();
            } else {
              // Insert new record
              const stmt = db.prepare(`INSERT INTO assets 
                (class, name, note, acquired_at, book_value_jpy, valuation_source, liquidity_tier, tags) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
              
              stmt.run(
                record.class,
                record.name,
                record.note,
                record.acquired_at,
                record.book_value_jpy,
                record.valuation_source,
                record.liquidity_tier,
                record.tags,
                function(err) {
                  if (!err) {
                    insertedCount++;
                    logAudit('assets', this.lastID, 'CREATE_CSV', null, record, 'system', 'csv_import');
                  }
                  callback(err);
                }
              );
              stmt.finalize();
            }
          });
        };
        
        // Process records sequentially
        let currentIndex = 0;
        const processNext = () => {
          if (currentIndex >= results.length) {
            // All processed successfully
            db.run('COMMIT');
            logAudit('assets', null, 'CSV_IMPORT', null, 
              { total: results.length, inserted: insertedCount, updated: updatedCount }, 
              req.session.user.id, 'csv_import');
            
            return res.json({
              success: true,
              message: `インポートが完了しました。${results.length}件の資産が処理されました。`,
              details: {
                total: results.length,
                inserted: insertedCount,
                updated: updatedCount
              }
            });
          }
          
          processRecord(results[currentIndex], (err) => {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ 
                error: 'インポート中にエラーが発生しました', 
                details: err.message 
              });
            }
            
            processedCount++;
            currentIndex++;
            processNext();
          });
        };
        
        processNext();
        
      } catch (error) {
        db.run('ROLLBACK');
        return res.status(500).json({ 
          error: 'トランザクション中にエラーが発生しました', 
          details: error.message 
        });
      }
    });
    
  } catch (error) {
    console.error('CSV parsing error:', error);
    return res.status(400).json({ 
      error: 'CSVのフォーマットが不正です', 
      details: error.message 
    });
  }
});

// CSV Export
app.get('/api/export', requireAuth, (req, res) => {
  const format = req.query.format || 'csv';
  
  if (format !== 'csv') {
    return res.status(400).json({ error: 'Only CSV format supported currently' });
  }
  
  db.all('SELECT * FROM assets ORDER BY class, name', (err, assets) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const csvWriter = createCsvWriter({
      path: path.join(__dirname, 'data', 'portfolio.csv'),
      header: [
        { id: 'class', title: 'class' },
        { id: 'name', title: 'name' },
        { id: 'note', title: 'note' },
        { id: 'acquired_at', title: 'acquired_at' },
        { id: 'book_value_jpy', title: 'book_value_jpy' },
        { id: 'valuation_source', title: 'valuation_source' },
        { id: 'liquidity_tier', title: 'liquidity_tier' },
        { id: 'tags', title: 'tags' }
      ]
    });
    
    csvWriter.writeRecords(assets)
      .then(() => {
        res.download(path.join(__dirname, 'data', 'portfolio.csv'));
      })
      .catch(error => {
        res.status(500).json({ error: error.message });
      });
  });
});

// CSV File Watcher
function setupCsvWatcher() {
  const csvPath = path.join(__dirname, 'data', 'portfolio.csv');
  
  const watcher = chokidar.watch(csvPath, {
    ignored: /^\./, 
    persistent: true,
    ignoreInitial: true
  });
  
  watcher.on('change', () => {
    console.log('CSV file changed, syncing to database...');
    syncCsvToDatabase(csvPath);
  });
  
  console.log(`Watching CSV file: ${csvPath}`);
}

function syncCsvToDatabase(csvPath) {
  if (!fs.existsSync(csvPath)) {
    console.log('CSV file not found, skipping sync');
    return;
  }
  
  const records = [];
  
  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (data) => {
      records.push(data);
    })
    .on('end', () => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        try {
          let insertedCount = 0;
          let updatedCount = 0;
          
          records.forEach((record) => {
            if (!record.class || !record.name || !record.book_value_jpy) {
              throw new Error('Missing required fields in CSV');
            }
            
            // Ensure note is empty string if not provided
            record.note = record.note || "";
            
            // Parse book value with currency format handling
            let bookValueStr = record.book_value_jpy.toString().trim();
            bookValueStr = bookValueStr
              .replace(/[¥$€£,"""]/g, '')
              .replace(/[^\d.-]/g, '');
            const bookValue = parseInt(bookValueStr) || parseFloat(bookValueStr);
            
            // Check if asset already exists
            const existingAsset = db.prepare('SELECT id FROM assets WHERE class = ? AND name = ?')
              .get(record.class, record.name);
            
            if (existingAsset) {
              // Update existing record
              const stmt = db.prepare(`UPDATE assets SET 
                note = ?, acquired_at = ?, book_value_jpy = ?, 
                valuation_source = ?, liquidity_tier = ?, tags = ?, updated_at = ?
                WHERE id = ?`);
              
              stmt.run(
                record.note,
                record.acquired_at,
                bookValue,
                record.valuation_source || 'manual',
                record.liquidity_tier,
                record.tags,
                new Date().toISOString(),
                existingAsset.id
              );
              stmt.finalize();
              updatedCount++;
              logAudit('assets', existingAsset.id, 'UPDATE_CSV_WATCHER', null, record, 'system', 'csv_watcher');
            } else {
              // Insert new record
              const stmt = db.prepare(`INSERT INTO assets 
                (class, name, note, acquired_at, book_value_jpy, valuation_source, liquidity_tier, tags) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
              
              const result = stmt.run(
                record.class,
                record.name,
                record.note,
                record.acquired_at,
                bookValue,
                record.valuation_source || 'manual',
                record.liquidity_tier,
                record.tags
              );
              stmt.finalize();
              insertedCount++;
              logAudit('assets', result.lastID, 'CREATE_CSV_WATCHER', null, record, 'system', 'csv_watcher');
            }
          });
          
          db.run('COMMIT');
          logAudit('assets', null, 'CSV_SYNC', null, 
            { total: records.length, inserted: insertedCount, updated: updatedCount }, 
            'system', 'csv_watcher');
          console.log(`Successfully synced ${records.length} records from CSV (${insertedCount} inserted, ${updatedCount} updated)`);
          
        } catch (error) {
          db.run('ROLLBACK');
          console.error('CSV sync failed:', error.message);
        }
      });
    })
    .on('error', (error) => {
      console.error('CSV parsing error:', error);
    });
}

// Serve static files from React build
app.use(express.static(path.join(__dirname, 'client', 'dist')));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

// Initialize database and start server
initDatabase();
setupCsvWatcher();

app.listen(port, () => {
  console.log(`Portfolio management server running on port ${port}`);
  console.log(`Dashboard URL: http://localhost:${port}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down gracefully...');
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Database connection closed.');
    process.exit(0);
  });
});