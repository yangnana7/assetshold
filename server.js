require('dotenv').config();
const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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

// Market data configuration
const MARKET_ENABLE = process.env.MARKET_ENABLE === '1';
console.log(`Market data: ${MARKET_ENABLE ? 'enabled' : 'disabled'}`);

if (!MARKET_ENABLE) {
  console.log('External market data fetching is disabled. Use MARKET_ENABLE=1 to enable.');
}

const app = express();

// Database initialization
const dbPath = path.join(__dirname, 'data', 'portfolio.db');
const db = new sqlite3.Database(dbPath);

// Enable WAL mode for better concurrency and reliability
db.run('PRAGMA journal_mode = WAL', (err) => {
  if (err) {
    console.error('Failed to enable WAL mode:', err);
  } else {
    console.log('WAL mode enabled for database');
  }
});

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

const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) { 
  console.error('SESSION_SECRET is required'); 
  process.exit(1); 
}

app.use(helmet({
  crossOriginOpenerPolicy: false,
  originAgentCluster: false
}));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Market data providers (BDD requirement 4.3)
const { makeStockProvider, makeFxProvider, makePreciousMetalProvider } = require('./providers/registry');

// Initialize providers
const stockProvider = makeStockProvider(MARKET_ENABLE);
const fxProvider = makeFxProvider(MARKET_ENABLE);
const preciousMetalProvider = makePreciousMetalProvider(MARKET_ENABLE);

// Cache strategy implementation (BDD requirement 4.4)
const CACHE_TTL = {
  stock: 15 * 60 * 1000,  // 15 minutes
  fx: 5 * 60 * 1000       // 5 minutes
};

// In-memory lock for concurrent request aggregation
const fetchLocks = new Map();

async function getCachedPrice(key, ttl) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM price_cache WHERE key = ?', [key], (err, row) => {
      if (err) return reject(err);
      
      if (!row) return resolve(null);
      
      const fetchedAt = new Date(row.fetched_at);
      const now = new Date();
      const isExpired = (now - fetchedAt) > ttl;
      
      resolve({
        data: JSON.parse(row.payload),
        stale: isExpired,
        fetchedAt: fetchedAt
      });
    });
  });
}

function setCachedPrice(key, payload) {
  const fetchedAt = new Date().toISOString();
  const payloadJson = JSON.stringify(payload);
  
  db.run(
    'INSERT OR REPLACE INTO price_cache (key, payload, fetched_at) VALUES (?, ?, ?)',
    [key, payloadJson, fetchedAt],
    (err) => {
      if (err) {
        console.error('Failed to cache price data:', err);
      }
    }
  );
}

async function fetchWithCache(key, ttl, fetchFn) {
  // Check for concurrent request lock
  if (fetchLocks.has(key)) {
    return fetchLocks.get(key);
  }

  try {
    // Check cache first
    const cached = await getCachedPrice(key, ttl);
    
    if (cached && !cached.stale) {
      return { ...cached.data, stale: false };
    }

    // Create fetch promise and add to locks
    const fetchPromise = (async () => {
      try {
        const data = await fetchFn();
        setCachedPrice(key, data);
        return { ...data, stale: false };
      } catch (error) {
        // If fetch fails and we have cached data, return it as stale
        if (cached) {
          console.log(`Using stale cache for ${key}:`, error.message);
          return { ...cached.data, stale: true };
        }
        throw error;
      }
    })();

    fetchLocks.set(key, fetchPromise);
    
    try {
      const result = await fetchPromise;
      return result;
    } finally {
      fetchLocks.delete(key);
    }
  } catch (error) {
    fetchLocks.delete(key);
    throw error;
  }
}

// Function to calculate current market value for assets
function calculateCurrentValue(asset) {
  const { class: assetClass, book_value_jpy } = asset;
  
  // For demo purposes, we'll use simple multipliers to simulate market changes
  // In production, you would fetch real market data from APIs
  const marketMultipliers = {
    'us_stock': 1.15,      // +15% (typical US stock growth)
    'jp_stock': 1.08,      // +8% (typical JP stock growth)
    'precious_metal': 1.12, // +12% (precious metals appreciation)
    'real_estate': 1.05,   // +5% (real estate appreciation)
    'watch': 1.20,         // +20% (luxury watches appreciation)
    'collection': 1.10,    // +10% (collectibles appreciation)
    'cash': 1.0            // Cash remains same value
  };
  
  const multiplier = marketMultipliers[assetClass] || 1.0;
  return Math.round(book_value_jpy * multiplier);
}

// Valuation calculation rules (BDD requirement 4.6)
function roundDown2(x) {
  return Math.floor(x * 100) / 100;
}

async function calculateMarketValue(asset) {
  const assetClass = asset.class;
  
  try {
    if (assetClass === 'us_stock' && asset.stock_details) {
      const { ticker, quantity } = asset.stock_details;
      const key = `stock:US:${ticker}`;
      
      // Get USD price
      const priceData = await fetchWithCache(key, CACHE_TTL.stock, 
        () => stockProvider.getQuote(ticker, 'US')
      );
      
      // Get USDJPY rate
      const fxKey = 'fx:USDJPY';
      const fxData = await fetchWithCache(fxKey, CACHE_TTL.fx,
        () => fxProvider.getRate('USDJPY')
      );
      
      const valueJpy = roundDown2(priceData.price * quantity * fxData.price);
      const fxContext = `USDJPY@${fxData.price}(${fxData.asOf})`;
      
      return {
        value_jpy: Math.floor(valueJpy),
        as_of: priceData.asOf,
        fx_context: fxContext,
        stale: priceData.stale || fxData.stale
      };
    }
    
    if (assetClass === 'jp_stock' && asset.stock_details) {
      const { code, quantity } = asset.stock_details;
      const key = `stock:JP:${code}`;
      
      const priceData = await fetchWithCache(key, CACHE_TTL.stock,
        () => stockProvider.getQuote(code, 'JP')
      );
      
      const valueJpy = roundDown2(priceData.price * quantity);
      
      return {
        value_jpy: Math.floor(valueJpy),
        as_of: priceData.asOf,
        fx_context: null,
        stale: priceData.stale
      };
    }
    
    if (assetClass === 'precious_metal' && asset.precious_metal_details) {
      const { metal, weight_g, purity } = asset.precious_metal_details;
      const key = `precious_metal:${metal}`;
      
      const priceData = await fetchWithCache(key, CACHE_TTL.stock,
        () => preciousMetalProvider.getQuote(metal, 'JP')
      );
      
      // Calculate price per gram adjusted for purity
      // Pure metal price * purity ratio
      const purityAdjustedPrice = priceData.price * purity;
      
      // Calculate total value: adjusted price per gram * weight in grams
      const valueJpy = roundDown2(purityAdjustedPrice * weight_g);
      
      return {
        value_jpy: Math.floor(valueJpy),
        unit_price_jpy: roundDown2(purityAdjustedPrice),
        as_of: priceData.asOf,
        fx_context: null,
        stale: priceData.stale
      };
    }
    
    // For other asset classes (watch, collection, real_estate), default to manual
    throw new Error(`Market valuation not supported for asset class: ${assetClass}`);
    
  } catch (error) {
    if (error.message.includes('Market data is disabled')) {
      throw { code: 'market_disabled', message: 'Market data fetching is disabled' };
    }
    throw { code: 'upstream_unavailable', message: error.message };
  }
}

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

    // Price cache table for market data (BDD requirement 4.2)
    db.run(`CREATE TABLE IF NOT EXISTS price_cache (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      fetched_at TEXT NOT NULL
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
      unit_price_jpy REAL,
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

// Helper functions for user management
function countUsers() {
  return new Promise((resolve, reject) => {
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
      if (err) return reject(err);
      resolve(row.count);
    });
  });
}

function createAdminUser(username, password) {
  return new Promise(async (resolve, reject) => {
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      db.run("INSERT INTO users (username, password) VALUES (?, ?)", 
        [username, hashedPassword], 
        function(err) {
          if (err) return reject(err);
          resolve(this.lastID);
        }
      );
    } catch (err) {
      reject(err);
    }
  });
}

// Routes

// Setup routes
app.get('/api/setup/status', async (req, res) => {
  try {
    const userCount = await countUsers();
    res.json({ 
      adminExists: userCount > 0, 
      setupRequired: userCount === 0 
    });
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/setup', async (req, res) => {
  try {
    const userCount = await countUsers();
    if (userCount > 0) {
      return res.status(400).json({ error: 'Admin user already exists' });
    }
    
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    
    await createAdminUser(username, password);
    res.json({ success: true });
  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ error: 'Setup failed' });
  }
});

// Authentication routes
const loginLimiter = rateLimit({ 
  windowMs: 60 * 1000, 
  max: 5,
  message: { error: 'Too many login attempts, please try again later' }
});

app.post('/api/login', loginLimiter, (req, res) => {
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
    topAssets: `SELECT name, note, book_value_jpy FROM assets ORDER BY book_value_jpy DESC LIMIT 3`,
    monthlyTrend: `
      SELECT 
        strftime('%Y-%m', created_at) as month,
        SUM(book_value_jpy) as book_value_total,
        SUM(book_value_jpy) as market_value_total
      FROM assets 
      WHERE created_at IS NOT NULL 
      GROUP BY strftime('%Y-%m', created_at)
      ORDER BY month DESC 
      LIMIT 12
    `
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

// User management routes (admin only)
app.get('/api/users', requireAdmin, (req, res) => {
  db.all('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.post('/api/users', requireAdmin, (req, res) => {
  const { username, password, role } = req.body;
  
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Username, password, and role are required' });
  }
  
  if (!['admin', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  
  // Check if username already exists
  db.get('SELECT id FROM users WHERE username = ?', [username], (err, existingUser) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (existingUser) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    
    // Hash password and create user
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) {
        return res.status(500).json({ error: 'Password hashing failed' });
      }
      
      db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
        [username, hash, role],
        function(err) {
          if (err) {
            return res.status(500).json({ error: err.message });
          }
          
          const newUser = {
            id: this.lastID,
            username,
            role,
            created_at: new Date().toISOString()
          };
          
          logAudit('users', this.lastID, 'CREATE', null, newUser, req.session.user.id);
          res.status(201).json(newUser);
        }
      );
    });
  });
});

app.patch('/api/users/:id', requireAdmin, (req, res) => {
  const userId = req.params.id;
  const { username, role } = req.body;
  
  // Prevent admin from editing their own role
  if (parseInt(userId) === req.session.user.id && role !== undefined) {
    return res.status(400).json({ error: 'Cannot change your own role' });
  }
  
  // Get current user data for audit
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, currentUser) => {
    if (err || !currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const updates = {};
    if (username && username !== currentUser.username) {
      // Check if new username is unique
      db.get('SELECT id FROM users WHERE username = ? AND id != ?', [username, userId], (err, existing) => {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        if (existing) {
          return res.status(409).json({ error: 'Username already exists' });
        }
        
        updates.username = username;
        performUserUpdate();
      });
    } else {
      performUserUpdate();
    }
    
    function performUserUpdate() {
      if (role && role !== currentUser.role) {
        if (!['admin', 'viewer'].includes(role)) {
          return res.status(400).json({ error: 'Invalid role' });
        }
        updates.role = role;
      }
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update' });
      }
      
      const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
      const values = Object.values(updates);
      values.push(userId);
      
      db.run(`UPDATE users SET ${setClause} WHERE id = ?`, values, function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        const updatedUser = { ...currentUser, ...updates, id: parseInt(userId) };
        delete updatedUser.password_hash;
        
        logAudit('users', userId, 'UPDATE', currentUser, updatedUser, req.session.user.id);
        res.json(updatedUser);
      });
    }
  });
});

app.patch('/api/users/:id/password', requireAdmin, (req, res) => {
  const userId = req.params.id;
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Password is required' });
  }
  
  if (password.length < 4) {
    return res.status(400).json({ error: 'Password must be at least 4 characters' });
  }
  
  // Get current user for audit
  db.get('SELECT username FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    bcrypt.hash(password, 10, (err, hash) => {
      if (err) {
        return res.status(500).json({ error: 'Password hashing failed' });
      }
      
      db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, userId], function(err) {
        if (err) {
          return res.status(500).json({ error: err.message });
        }
        
        logAudit('users', userId, 'PASSWORD_CHANGE', null, { username: user.username }, req.session.user.id);
        res.json({ success: true, message: 'Password updated successfully' });
      });
    });
  });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const userId = req.params.id;
  
  // Prevent deletion of current user
  if (parseInt(userId) === req.session.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  
  // Get current user data for audit
  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, currentUser) => {
    if (err || !currentUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    db.run('DELETE FROM users WHERE id = ?', [userId], function(err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      logAudit('users', userId, 'DELETE', currentUser, null, req.session.user.id);
      res.json({ success: true });
    });
  });
});

// Assets CRUD routes with current valuation
app.get('/api/assets', (req, res) => {
  const { class: assetClass, page = '1', limit = '30' } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;
  
  let baseQuery = 'SELECT * FROM assets';
  let countQuery = 'SELECT COUNT(*) as total FROM assets';
  let params = [];
  
  if (assetClass) {
    baseQuery += ' WHERE class = ?';
    countQuery += ' WHERE class = ?';
    params.push(assetClass);
  }
  
  baseQuery += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  
  // First get total count
  db.get(countQuery, params, (err, countResult) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    const total = countResult.total;
    const totalPages = Math.ceil(total / limitNum);
    
    // Then get paginated data
    db.all(baseQuery, [...params, limitNum, offset], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      
      // Enhanced data processing for both paginated and non-paginated requests
      const enhancedRows = [];
      let completed = 0;
      
      if (rows.length === 0) {
        if (req.query.page) {
          return res.json({
            assets: [],
            pagination: {
              page: pageNum,
              limit: limitNum,
              total: total,
              totalPages: totalPages
            }
          });
        }
        return res.json([]);
      }
      
      // Process assets with enhanced details
      rows.forEach(asset => {
        if (asset.class === 'us_stock' || asset.class === 'jp_stock') {
          const table = asset.class === 'us_stock' ? 'us_stocks' : 'jp_stocks';
          const priceField = asset.class === 'us_stock' ? 'avg_price_usd' : 'avg_price_jpy';
          
          db.get(`SELECT * FROM ${table} WHERE asset_id = ?`, [asset.id], (err, details) => {
            if (!err && details) {
              const evaluation = Math.floor((details[priceField] || 0) * (details.quantity || 0));
              asset.stock_details = {
                ...details,
                evaluation: evaluation
              };
            }
            
            // Get latest market valuation for total value
            db.get('SELECT value_jpy FROM valuations WHERE asset_id = ? ORDER BY as_of DESC, id DESC LIMIT 1', [asset.id], (err, valuation) => {
              if (!err && valuation && valuation.value_jpy) {
                // Use actual market valuation if available
                asset.current_value_jpy = valuation.value_jpy;
              } else {
                // Fallback to legacy calculation
                asset.current_value_jpy = calculateCurrentValue(asset);
              }
              
              asset.gain_loss_jpy = asset.current_value_jpy - asset.book_value_jpy;
              asset.gain_loss_percentage = ((asset.current_value_jpy - asset.book_value_jpy) / asset.book_value_jpy * 100).toFixed(2);
            
              enhancedRows.push(asset);
              completed++;
              if (completed === rows.length) {
                if (req.query.page) {
                  res.json({
                    assets: enhancedRows,
                    pagination: {
                      page: pageNum,
                      limit: limitNum,
                      total: total,
                      totalPages: totalPages
                    }
                  });
                } else {
                  res.json(enhancedRows);
                }
              }
            });
          });
        } else if (asset.class === 'precious_metal') {
          db.get('SELECT * FROM precious_metals WHERE asset_id = ?', [asset.id], (err, details) => {
            if (!err && details) {
              const evaluation = Math.floor((details.unit_price_jpy || 0) * (details.weight_g || 0));
              asset.precious_metal_details = {
                ...details,
                evaluation: evaluation
              };
            }
            
            // Get latest market valuation for unit price and total value
            db.get('SELECT unit_price_jpy, value_jpy FROM valuations WHERE asset_id = ? ORDER BY as_of DESC, id DESC LIMIT 1', [asset.id], (err, valuation) => {
              if (!err && valuation) {
                if (valuation.unit_price_jpy) {
                  asset.market_unit_price_jpy = valuation.unit_price_jpy;
                }
                if (valuation.value_jpy) {
                  // Use actual market valuation if available
                  asset.current_value_jpy = valuation.value_jpy;
                } else {
                  // Fallback to legacy calculation
                  asset.current_value_jpy = calculateCurrentValue(asset);
                }
              } else {
                // No market valuation available, use legacy calculation
                asset.current_value_jpy = calculateCurrentValue(asset);
              }
              asset.gain_loss_jpy = asset.current_value_jpy - asset.book_value_jpy;
              asset.gain_loss_percentage = ((asset.current_value_jpy - asset.book_value_jpy) / asset.book_value_jpy * 100).toFixed(2);
              
              enhancedRows.push(asset);
              completed++;
              if (completed === rows.length) {
                if (req.query.page) {
                  res.json({
                    assets: enhancedRows,
                    pagination: {
                      page: pageNum,
                      limit: limitNum,
                      total: total,
                      totalPages: totalPages
                    }
                  });
                } else {
                  res.json(enhancedRows);
                }
              }
            });
          });
        } else {
          // Add current market value to asset
          asset.current_value_jpy = calculateCurrentValue(asset);
          asset.gain_loss_jpy = asset.current_value_jpy - asset.book_value_jpy;
          asset.gain_loss_percentage = ((asset.current_value_jpy - asset.book_value_jpy) / asset.book_value_jpy * 100).toFixed(2);
          
          enhancedRows.push(asset);
          completed++;
          if (completed === rows.length) {
            if (req.query.page) {
              res.json({
                assets: enhancedRows,
                pagination: {
                  page: pageNum,
                  limit: limitNum,
                  total: total,
                  totalPages: totalPages
                }
              });
            } else {
              res.json(enhancedRows);
            }
          }
        }
      });
    });
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
    
    const asset = row;
    
    if (asset.class === 'precious_metal') {
      db.get('SELECT * FROM precious_metals WHERE asset_id = ?', [asset.id], (err, details) => {
        if (!err && details) {
          asset.precious_metal_details = details;
        }
        
        // Get latest market valuation for unit price and total value
        db.get('SELECT unit_price_jpy, value_jpy FROM valuations WHERE asset_id = ? ORDER BY as_of DESC, id DESC LIMIT 1', [asset.id], (err, valuation) => {
          if (!err && valuation) {
            if (valuation.unit_price_jpy) {
              asset.market_unit_price_jpy = valuation.unit_price_jpy;
            }
            if (valuation.value_jpy) {
              // Use actual market valuation if available
              asset.current_value_jpy = valuation.value_jpy;
            } else {
              // Fallback to legacy calculation
              asset.current_value_jpy = calculateCurrentValue(asset);
            }
          } else {
            // No market valuation available, use legacy calculation
            asset.current_value_jpy = calculateCurrentValue(asset);
          }
          asset.gain_loss_jpy = asset.current_value_jpy - asset.book_value_jpy;
          asset.gain_loss_percentage = ((asset.current_value_jpy - asset.book_value_jpy) / asset.book_value_jpy * 100).toFixed(2);
          
          res.json(asset);
        });
      });
    } else if (asset.class === 'jp_stock' || asset.class === 'us_stock') {
      // Handle stock assets
      const detailsTable = asset.class === 'jp_stock' ? 'jp_stocks' : 'us_stocks';
      db.get(`SELECT * FROM ${detailsTable} WHERE asset_id = ?`, [asset.id], (err, details) => {
        if (!err && details) {
          asset.stock_details = details;
        }
        
        // Get latest market valuation for total value
        db.get('SELECT value_jpy FROM valuations WHERE asset_id = ? ORDER BY as_of DESC, id DESC LIMIT 1', [asset.id], (err, valuation) => {
          if (!err && valuation && valuation.value_jpy) {
            // Use actual market valuation if available
            asset.current_value_jpy = valuation.value_jpy;
          } else {
            // Fallback to legacy calculation
            asset.current_value_jpy = calculateCurrentValue(asset);
          }
          
          asset.gain_loss_jpy = asset.current_value_jpy - asset.book_value_jpy;
          asset.gain_loss_percentage = ((asset.current_value_jpy - asset.book_value_jpy) / asset.book_value_jpy * 100).toFixed(2);
          
          res.json(asset);
        });
      });
    } else {
      // Handle other asset classes
      // Get latest market valuation if available
      db.get('SELECT value_jpy FROM valuations WHERE asset_id = ? ORDER BY as_of DESC, id DESC LIMIT 1', [asset.id], (err, valuation) => {
        if (!err && valuation && valuation.value_jpy) {
          // Use actual market valuation if available
          asset.current_value_jpy = valuation.value_jpy;
        } else {
          // Fallback to legacy calculation
          asset.current_value_jpy = calculateCurrentValue(asset);
        }
        
        asset.gain_loss_jpy = asset.current_value_jpy - asset.book_value_jpy;
        asset.gain_loss_percentage = ((asset.current_value_jpy - asset.book_value_jpy) / asset.book_value_jpy * 100).toFixed(2);
        
        res.json(asset);
      });
    }
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
    tags,
    // Stock-specific fields
    ticker,
    exchange,
    code,
    quantity,
    avg_price_usd,
    avg_price_jpy,
    // Precious metal-specific fields
    metal,
    weight_g,
    purity,
    unit_price_jpy
  } = req.body;
  
  // Validation
  if (!assetClass || !name || !book_value_jpy || !liquidity_tier) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Class-specific validation
  if (assetClass === 'us_stock' && (!ticker || !quantity || !avg_price_usd)) {
    return res.status(400).json({ error: 'Missing required US stock fields' });
  }
  if (assetClass === 'jp_stock' && (!code || !quantity || !avg_price_jpy)) {
    return res.status(400).json({ error: 'Missing required JP stock fields' });
  }
  if (assetClass === 'precious_metal' && (!metal || !weight_g || !unit_price_jpy)) {
    return res.status(400).json({ error: 'Missing required precious metal fields' });
  }
  
  db.serialize(() => {
    db.run('BEGIN TRANSACTION');
    
    try {
      const stmt = db.prepare(`INSERT INTO assets 
        (class, name, note, acquired_at, book_value_jpy, valuation_source, liquidity_tier, tags) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      
      stmt.run(
        assetClass, name, note, acquired_at, book_value_jpy, 
        valuation_source, liquidity_tier, tags,
        function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: err.message });
          }
          
          const assetId = this.lastID;
          
          // Insert class-specific data
          if (assetClass === 'us_stock') {
            const stockStmt = db.prepare(`INSERT INTO us_stocks 
              (asset_id, ticker, exchange, quantity, avg_price_usd) 
              VALUES (?, ?, ?, ?, ?)`);
            stockStmt.run(assetId, ticker, exchange, parseFloat(quantity), parseFloat(avg_price_usd));
            stockStmt.finalize();
          } else if (assetClass === 'jp_stock') {
            const stockStmt = db.prepare(`INSERT INTO jp_stocks 
              (asset_id, code, quantity, avg_price_jpy) 
              VALUES (?, ?, ?, ?)`);
            stockStmt.run(assetId, code, parseFloat(quantity), parseFloat(avg_price_jpy));
            stockStmt.finalize();
          } else if (assetClass === 'precious_metal') {
            const metalStmt = db.prepare(`INSERT INTO precious_metals 
              (asset_id, metal, weight_g, purity, unit_price_jpy) 
              VALUES (?, ?, ?, ?, ?)`);
            metalStmt.run(assetId, metal, parseFloat(weight_g), purity ? parseFloat(purity) : null, parseFloat(unit_price_jpy));
            metalStmt.finalize();
          }
          
          db.run('COMMIT');
          
          const newAsset = {
            id: assetId,
            class: assetClass,
            name,
            note,
            acquired_at,
            book_value_jpy,
            valuation_source,
            liquidity_tier,
            tags
          };
          
          logAudit('assets', assetId, 'CREATE', null, newAsset, req.session.user.id);
          res.status(201).json(newAsset);
        }
      );
      stmt.finalize();
    } catch (error) {
      db.run('ROLLBACK');
      return res.status(500).json({ error: error.message });
    }
  });
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

// Helper function to insert class-specific data
function insertClassSpecificData(record, assetId, callback) {
  try {
    if (record.class === 'us_stock' && record.ticker && record.quantity && record.avg_price_usd) {
      // Delete existing record first (for update case)
      db.run('DELETE FROM us_stocks WHERE asset_id = ?', [assetId], (err) => {
        if (!err) {
          const stmt = db.prepare(`INSERT INTO us_stocks 
            (asset_id, ticker, exchange, quantity, avg_price_usd) 
            VALUES (?, ?, ?, ?, ?)`);
          stmt.run(assetId, record.ticker, record.exchange || '', 
            parseFloat(record.quantity), parseFloat(record.avg_price_usd), callback);
          stmt.finalize();
        } else {
          callback(err);
        }
      });
    } else if (record.class === 'jp_stock' && record.code && record.quantity && record.avg_price_jpy) {
      db.run('DELETE FROM jp_stocks WHERE asset_id = ?', [assetId], (err) => {
        if (!err) {
          const stmt = db.prepare(`INSERT INTO jp_stocks 
            (asset_id, code, quantity, avg_price_jpy) 
            VALUES (?, ?, ?, ?)`);
          stmt.run(assetId, record.code, 
            parseFloat(record.quantity), parseFloat(record.avg_price_jpy), callback);
          stmt.finalize();
        } else {
          callback(err);
        }
      });
    } else if (record.class === 'precious_metal' && record.metal && record.weight_g && record.unit_price_jpy) {
      db.run('DELETE FROM precious_metals WHERE asset_id = ?', [assetId], (err) => {
        if (!err) {
          const stmt = db.prepare(`INSERT INTO precious_metals 
            (asset_id, metal, weight_g, purity, unit_price_jpy) 
            VALUES (?, ?, ?, ?, ?)`);
          stmt.run(assetId, record.metal, 
            parseFloat(record.weight_g), 
            record.purity ? parseFloat(record.purity) : null, 
            parseFloat(record.unit_price_jpy), callback);
          stmt.finalize();
        } else {
          callback(err);
        }
      });
    } else {
      // No class-specific data to insert
      callback(null);
    }
  } catch (error) {
    callback(error);
  }
}

// Import CSV validation
const { validateHeaders, validateRow } = require('./server/csv/normalize');

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
    
    // Validate headers with enhanced validation
    try {
      validateHeaders(headers);
    } catch (err) {
      return res.status(400).json({ 
        error: `ヘッダー検証エラー: ${err.message}`,
        details: `必要なヘッダー: class, name, acquired_at, book_value_jpy, liquidity_tier`
      });
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
      
      // Enhanced row validation
      try {
        validateRow(record);
      } catch (err) {
        throw new Error(`行 ${i + 1}: ${err.message}`);
      }
      
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
                    
                    // Update class-specific data
                    insertClassSpecificData(record, existing.id, (classErr) => {
                      callback(classErr || err);
                    });
                  } else {
                    callback(err);
                  }
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
                    const assetId = this.lastID;
                    insertedCount++;
                    logAudit('assets', assetId, 'CREATE_CSV', null, record, 'system', 'csv_import');
                    
                    // Insert class-specific data
                    insertClassSpecificData(record, assetId, (classErr) => {
                      callback(classErr || err);
                    });
                  } else {
                    callback(err);
                  }
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
  
  if (!['csv', 'json', 'md'].includes(format)) {
    return res.status(400).json({ error: 'Supported formats: csv, json, md' });
  }
  
  db.all('SELECT * FROM assets ORDER BY class, name', (err, assets) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    if (format === 'json') {
      res.setHeader('Content-Disposition', 'attachment; filename="portfolio.json"');
      res.setHeader('Content-Type', 'application/json');
      return res.json(assets);
    }
    
    if (format === 'md') {
      const markdown = '# Portfolio Export\n\n' +
        assets.map(a => `## ${a.name}\n- Class: ${a.class}\n- Value: ¥${a.book_value_jpy?.toLocaleString() || 'N/A'}\n- Tier: ${a.liquidity_tier}\n`).join('\n');
      res.setHeader('Content-Disposition', 'attachment; filename="portfolio.md"');
      res.setHeader('Content-Type', 'text/markdown');
      return res.send(markdown);
    }
    
    // CSV format
    const csvWriter = createCsvWriter({
      path: path.join(__dirname, 'data', 'portfolio_export.csv'),
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
        res.download(path.join(__dirname, 'data', 'portfolio_export.csv'));
      })
      .catch(error => {
        res.status(500).json({ error: error.message });
      });
  });
});

// Market data API endpoints (BDD requirement 4.5)

// POST /api/valuations/:assetId/refresh - No auth required for guest users
app.post('/api/valuations/:assetId/refresh', async (req, res) => {
  if (!MARKET_ENABLE) {
    return res.status(403).json({ code: 'market_disabled', message: 'Market data is disabled' });
  }

  const assetId = parseInt(req.params.assetId);
  
  try {
    // Get asset with details
    db.get('SELECT * FROM assets WHERE id = ?', [assetId], async (err, asset) => {
      if (err || !asset) {
        return res.status(404).json({ error: 'Asset not found' });
      }

      try {
        // Get stock/precious metal details if applicable
        if (asset.class === 'us_stock' || asset.class === 'jp_stock') {
          const table = asset.class === 'us_stock' ? 'us_stocks' : 'jp_stocks';
          db.get(`SELECT * FROM ${table} WHERE asset_id = ?`, [assetId], async (err, details) => {
            if (err || !details) {
              return res.status(400).json({ error: 'Stock details not found' });
            }

            asset.stock_details = details;
            await processMarketValuation(asset, req, res);
          });
        } else if (asset.class === 'precious_metal') {
          db.get('SELECT * FROM precious_metals WHERE asset_id = ?', [assetId], async (err, details) => {
            if (err || !details) {
              return res.status(400).json({ error: 'Precious metal details not found' });
            }

            asset.precious_metal_details = details;
            await processMarketValuation(asset, req, res);
          });
        } else {
          return res.status(400).json({ error: `Market valuation not supported for asset class: ${asset.class}` });
        }
      } catch (error) {
        console.error('Market valuation error:', error);
        if (error.code === 'market_disabled') {
          return res.status(403).json(error);
        } else if (error.code === 'upstream_unavailable') {
          return res.status(502).json(error);
        }
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  } catch (error) {
    console.error('Valuation refresh error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

async function processMarketValuation(asset, req, res) {
  try {
    console.log('Processing market valuation for asset:', asset.id, asset.class, asset.name);
    console.log('Asset precious_metal_details:', asset.precious_metal_details);
    const valuation = await calculateMarketValue(asset);
    console.log('Calculated valuation:', valuation);
    
    // Save to valuations table
    db.run(
      'INSERT INTO valuations (asset_id, as_of, value_jpy, unit_price_jpy, fx_context) VALUES (?, ?, ?, ?, ?)',
      [asset.id, valuation.as_of, valuation.value_jpy, valuation.unit_price_jpy, valuation.fx_context],
      function(err) {
        if (err) {
          console.error('Failed to save valuation:', err);
          return res.status(500).json({ error: 'Failed to save valuation' });
        }

        // Log audit - use session user if available, otherwise guest
        logAudit('assets', asset.id, 'valuation_refresh', null, valuation, 
          req.session.user ? req.session.user.id : 'guest');

        res.json({
          value_jpy: valuation.value_jpy,
          unit_price_jpy: valuation.unit_price_jpy,
          as_of: valuation.as_of,
          fx_context: valuation.fx_context,
          stale: valuation.stale
        });
      }
    );
  } catch (error) {
    if (error.code === 'market_disabled') {
      return res.status(403).json(error);
    } else if (error.code === 'upstream_unavailable') {
      return res.status(502).json(error);
    }
    return res.status(500).json({ error: error.message });
  }
}

// POST /api/valuations/refresh-all - Bulk market data refresh for all supported assets
app.post('/api/valuations/refresh-all', async (req, res) => {
  if (!MARKET_ENABLE) {
    return res.status(403).json({ code: 'market_disabled', message: 'Market data is disabled' });
  }

  try {
    // Get all assets that support market valuation
    const supportedAssetClasses = ['us_stock', 'jp_stock', 'precious_metal'];
    const query = `SELECT * FROM assets WHERE class IN (${supportedAssetClasses.map(() => '?').join(',')})`;
    
    db.all(query, supportedAssetClasses, async (err, assets) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to fetch assets' });
      }

      let updatedCount = 0;
      let errorCount = 0;
      const results = [];

      // Process assets sequentially to avoid overwhelming the providers
      for (const asset of assets) {
        try {
          // Get asset-specific details
          let detailsQuery = '';
          let detailsTable = '';

          if (asset.class === 'us_stock' || asset.class === 'jp_stock') {
            detailsTable = asset.class === 'us_stock' ? 'us_stocks' : 'jp_stocks';
            detailsQuery = `SELECT * FROM ${detailsTable} WHERE asset_id = ?`;
          } else if (asset.class === 'precious_metal') {
            detailsTable = 'precious_metals';
            detailsQuery = `SELECT * FROM ${detailsTable} WHERE asset_id = ?`;
          }

          if (detailsQuery) {
            const details = await new Promise((resolve, reject) => {
              db.get(detailsQuery, [asset.id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
              });
            });

            if (details) {
              if (asset.class === 'us_stock' || asset.class === 'jp_stock') {
                asset.stock_details = details;
              } else if (asset.class === 'precious_metal') {
                asset.precious_metal_details = details;
              }

              // Calculate market valuation
              const valuation = await calculateMarketValue(asset);

              // Save to valuations table
              await new Promise((resolve, reject) => {
                db.run(
                  'INSERT INTO valuations (asset_id, as_of, value_jpy, fx_context) VALUES (?, ?, ?, ?)',
                  [asset.id, valuation.as_of, valuation.value_jpy, valuation.fx_context],
                  function(err) {
                    if (err) reject(err);
                    else resolve();
                  }
                );
              });

              // Log audit
              logAudit('assets', asset.id, 'valuation_refresh_bulk', null, valuation, 
                req.session.user ? req.session.user.id : 'guest');

              results.push({
                asset_id: asset.id,
                name: asset.name,
                class: asset.class,
                value_jpy: valuation.value_jpy,
                stale: valuation.stale
              });

              updatedCount++;
            }
          }
        } catch (error) {
          console.error(`Failed to update valuation for asset ${asset.id}:`, error);
          errorCount++;
        }
      }

      res.json({
        message: 'Bulk market data refresh completed',
        updated: updatedCount,
        errors: errorCount,
        total: assets.length,
        results: results
      });
    });
  } catch (error) {
    console.error('Bulk valuation refresh error:', error);
    if (error.code === 'market_disabled') {
      return res.status(403).json(error);
    } else if (error.code === 'upstream_unavailable') {
      return res.status(502).json(error);
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/market/status
app.get('/api/market/status', (req, res) => {
  res.json({
    enabled: MARKET_ENABLE,
    provider: {
      stock: stockProvider.name,
      fx: fxProvider.name,
      precious_metal: preciousMetalProvider.name
    },
    now: new Date().toISOString()
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

// WAL Checkpoint function
function performWalCheckpoint() {
  db.run('PRAGMA wal_checkpoint(TRUNCATE)', (err) => {
    if (err) {
      console.error('WAL checkpoint failed:', err);
    } else {
      console.log('WAL checkpoint completed');
    }
  });
}

// Setup periodic WAL checkpoints (every minute)
function setupWalCheckpoints() {
  setInterval(() => {
    performWalCheckpoint();
  }, 60000); // 60 seconds
  console.log('WAL checkpoint scheduled every 60 seconds');
}

// Backup database function
function backupDatabase() {
  const backupDir = path.join(__dirname, 'backup');
  
  // Ensure backup directory exists
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
  const backupPath = path.join(backupDir, `portfolio_${timestamp}.db`);
  
  try {
    // Perform final checkpoint before backup
    db.run('PRAGMA wal_checkpoint(TRUNCATE)', (err) => {
      if (err) {
        console.error('Final checkpoint before backup failed:', err);
      }
      
      // Copy database file
      fs.copyFileSync(dbPath, backupPath);
      console.log(`Database backed up to: ${backupPath}`);
    });
  } catch (error) {
    console.error('Database backup failed:', error);
  }
}

// Initialize database and start server
initDatabase();
setupCsvWatcher();
setupWalCheckpoints();

app.listen(port, '0.0.0.0', () => {
  console.log(`Portfolio management server running on port ${port}`);
  console.log(`Primary URL: http://assets.local:${port}`);
  console.log(`Alternative URL: http://localhost:${port}`);
  console.log(`Network access: http://<server-ip>:${port}`);
  console.log('\nTo access via assets.local, add this line to your hosts file:');
  console.log('127.0.0.1 assets.local');
  console.log('WAL mode enabled for database');
});

// Graceful shutdown with backup
function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  
  // Perform backup before shutdown
  console.log('Creating backup before shutdown...');
  backupDatabase();
  
  // Wait a bit for backup to complete, then close database
  setTimeout(() => {
    db.close((err) => {
      if (err) {
        console.error('Database close error:', err.message);
      } else {
        console.log('Database connection closed.');
      }
      console.log('Server shutdown complete.');
      process.exit(0);
    });
  }, 2000);
}

// Handle different shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));