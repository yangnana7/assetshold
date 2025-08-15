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
const { recalcBookValue } = require('./server/services/bookval');
const Comps = require('./server/comps/service');
const Rebalance = require('./server/rebalance/service');
const { round2Floor } = require('./server/utils/number');
const { fxKey, stockKey, metalKey } = require('./server/utils/keys');
const { REQUIRED_PORT, validateRequiredPortOrExit, isMarketEnabled, getSessionSecretOrExit, CACHE_TTL } = require('./server/utils/config');
const { MarketDisabledError } = require('./providers/base');

// MANDATORY PORT CHECK - Must fail if not port 3009
const port = validateRequiredPortOrExit();

// Market data configuration
const MARKET_ENABLE = isMarketEnabled();
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

const SESSION_SECRET = getSessionSecretOrExit();

// Helmet disabled to prevent HTTPS redirect issues on Ubuntu deployment
// app.use(helmet({
//   crossOriginOpenerPolicy: false,
//   originAgentCluster: false,
//   contentSecurityPolicy: {
//     directives: {
//       defaultSrc: ["'self'"],
//       styleSrc: ["'self'", "'unsafe-inline'"],
//       scriptSrc: ["'self'"],
//       imgSrc: ["'self'", "data:"],
//       fontSrc: ["'self'"],
//     }
//   }
// }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // HTTPでの動作を保証
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Market data providers (BDD requirement 4.3)
const { makeStockProvider, makeFxProvider, makePreciousMetalProvider } = require('./providers/registry');

// Duplicate detection service
const DuplicateDetectionService = require('./server/duplicates/service');

// Initialize providers
const stockProvider = makeStockProvider(MARKET_ENABLE);
const fxProvider = makeFxProvider(MARKET_ENABLE);
const preciousMetalProvider = makePreciousMetalProvider(MARKET_ENABLE);

// Initialize duplicate detection service
const duplicateService = new DuplicateDetectionService(db);

// Cache strategy implementation (BDD requirement 4.4)

// Centralized cache helpers (DRY)
const { createCache } = require('./server/utils/cache');
const { getCachedPrice, setCachedPrice, fetchWithCache } = createCache(db);

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
      const key = stockKey('US', ticker);
      
      // Get USD price
      const priceData = await fetchWithCache(key, CACHE_TTL.stock, 
        () => stockProvider.getQuote(ticker, 'US')
      );
      
      // Get USDJPY rate
      const fxKeyStr = fxKey('USDJPY');
      const fxData = await fetchWithCache(fxKeyStr, CACHE_TTL.fx,
        () => fxProvider.getRate('USDJPY')
      );
      
      const valueJpy = round2Floor(priceData.price * quantity * fxData.price);
      const fxContext = `USDJPY@${fxData.price}(${fxData.asOf})`;
      
      // Update us_stocks table with current market price in USD
      try {
        await new Promise((resolve, reject) => {
          db.run(
            'UPDATE us_stocks SET market_price_usd = ? WHERE asset_id = ?',
            [priceData.price, asset.id],
            function(err) {
              if (err) reject(err);
              else resolve();
            }
          );
        });
      } catch (updateError) {
        console.error(`Failed to update USD market price for asset ${asset.id}:`, updateError);
      }
      
      return {
        value_jpy: Math.floor(valueJpy),
        as_of: priceData.asOf,
        fx_context: fxContext,
        stale: priceData.stale || fxData.stale,
        market_price_usd: priceData.price // Include USD price in response
      };
    }
    
    if (assetClass === 'jp_stock' && asset.stock_details) {
      const { code, quantity } = asset.stock_details;
      const key = stockKey('JP', code);
      
      const priceData = await fetchWithCache(key, CACHE_TTL.stock,
        () => stockProvider.getQuote(code, 'JP')
      );
      
      const valueJpy = round2Floor(priceData.price * quantity);
      
      return {
        value_jpy: Math.floor(valueJpy),
        as_of: priceData.asOf,
        fx_context: null,
        stale: priceData.stale
      };
    }
    
    if (assetClass === 'precious_metal' && asset.precious_metal_details) {
      const { metal, weight_g, purity } = asset.precious_metal_details;
      const key = metalKey(metal);
      
      const priceData = await fetchWithCache(key, CACHE_TTL.stock,
        () => preciousMetalProvider.getQuote(metal, 'JP')
      );
      
      // Calculate price per gram adjusted for purity
      // Pure metal price * purity ratio
      const purityAdjustedPrice = priceData.price * purity;
      
      // Calculate total value: adjusted price per gram * weight in grams
      const valueJpy = round2Floor(purityAdjustedPrice * weight_g);
      
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
    if (error instanceof MarketDisabledError) {
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
      unit_price_jpy REAL,
      FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
    )`);

    // Ensure unit_price_jpy exists for older DBs
    db.all('PRAGMA table_info(valuations)', (err, rows) => {
      if (!err && rows && !rows.some(r => r.name === 'unit_price_jpy')) {
        db.run('ALTER TABLE valuations ADD COLUMN unit_price_jpy REAL');
      }
    });

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

    // Attachments table (files/links associated with assets)
    db.run(`CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,
      filename TEXT,
      url TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
    )`);

    // Comparable Sales table (BDD 2.5)
    db.run(`CREATE TABLE IF NOT EXISTS comparable_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id INTEGER NOT NULL,
      sale_date TEXT NOT NULL,
      price REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'JPY',
      price_jpy REAL NOT NULL,
      source TEXT,
      source_url TEXT,
      marketplace TEXT,
      condition_grade TEXT,
      completeness TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT,
      FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
    )`);

    // Settings and Target Allocations (BDD 2.4)
    db.run(`CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS target_allocations (
      class TEXT PRIMARY KEY,
      target_pct REAL NOT NULL
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

    // SECURITY: Default admin user creation disabled for security
    // Create admin user manually or through proper setup process
    // db.get("SELECT id FROM users WHERE username = 'admin'", (err, row) => {
    //   if (!row) {
    //     bcrypt.hash('admin', 10, (err, hash) => {
    //       if (!err) {
    //         db.run("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)", 
    //           ['admin', hash, 'admin']);
    //       }
    //     });
    //   }
    // });
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
  console.log('Session check:', {
    hasSession: !!req.session,
    hasUser: !!req.session?.user,
    userRole: req.session?.user?.role,
    sessionId: req.sessionID
  });
  
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
    totalValue: `
      SELECT SUM(COALESCE(v.value_jpy, a.book_value_jpy)) as total 
      FROM assets a
      LEFT JOIN (
        SELECT asset_id, value_jpy,
               ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY as_of DESC, id DESC) as rn
        FROM valuations
      ) v ON a.id = v.asset_id AND v.rn = 1
    `,
    assetsByClass: `
      SELECT a.class, COUNT(*) as count, SUM(COALESCE(v.value_jpy, a.book_value_jpy)) as total_value 
      FROM assets a
      LEFT JOIN (
        SELECT asset_id, value_jpy,
               ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY as_of DESC, id DESC) as rn
        FROM valuations
      ) v ON a.id = v.asset_id AND v.rn = 1
      GROUP BY a.class
    `,
    topAssets: `
      SELECT a.name, a.note, a.book_value_jpy, COALESCE(v.value_jpy, a.book_value_jpy) as current_value_jpy
      FROM assets a
      LEFT JOIN (
        SELECT asset_id, value_jpy,
               ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY as_of DESC, id DESC) as rn
        FROM valuations
      ) v ON a.id = v.asset_id AND v.rn = 1
      ORDER BY COALESCE(v.value_jpy, a.book_value_jpy) DESC 
      LIMIT 3
    `,
    monthlyTrend: `
      SELECT 
        strftime('%Y-%m', a.created_at) as month,
        SUM(a.book_value_jpy) as book_value_total,
        SUM(COALESCE(v.value_jpy, a.book_value_jpy)) as market_value_total
      FROM assets a
      LEFT JOIN (
        SELECT asset_id, value_jpy,
               ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY as_of DESC, id DESC) as rn
        FROM valuations
      ) v ON a.id = v.asset_id AND v.rn = 1
      WHERE a.created_at IS NOT NULL 
      GROUP BY strftime('%Y-%m', a.created_at)
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

// Dashboard class summary route - book value vs market value comparison by asset class
app.get('/api/dashboard/class-summary', (req, res) => {
  const query = `
    SELECT
      a.class AS class,
      SUM(a.book_value_jpy) AS book_total_jpy,
      SUM(
        COALESCE(
          (SELECT v.value_jpy
           FROM valuations v
           WHERE v.asset_id = a.id
           ORDER BY v.as_of DESC, v.id DESC
           LIMIT 1),
          a.book_value_jpy
        )
      ) AS market_total_jpy,
      COUNT(*) AS count_assets
    FROM assets a
    GROUP BY a.class
    ORDER BY book_total_jpy DESC
  `;

  db.all(query, (err, rows) => {
    if (err) {
      console.error('Class summary query error:', err);
      return res.status(500).json({ error: 'データベースクエリエラー' });
    }

    const response = {
      as_of: new Date().toISOString(),
      items: rows.map(row => ({
        class: row.class,
        book_total_jpy: Math.round(row.book_total_jpy || 0),
        market_total_jpy: Math.round(row.market_total_jpy || 0),
        count: row.count_assets || 0
      }))
    };

    res.json(response);
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
              
              // Include market_price_usd for US stocks
              if (asset.class === 'us_stock') {
                asset.stock_details.market_price_usd = details.market_price_usd || null;
              }
            }
            
            // Get latest market valuation for total value (and fx_context for derived per-share)
            db.get('SELECT value_jpy, fx_context FROM valuations WHERE asset_id = ? ORDER BY as_of DESC, id DESC LIMIT 1', [asset.id], (err, valuation) => {
              if (!err && valuation && valuation.value_jpy) {
                // Use actual market valuation if available
                asset.current_value_jpy = valuation.value_jpy;

                // US株の単価（USD）派生: valuation と fx_context があり quantity>0 のとき
                if (asset.class === 'us_stock' && asset.stock_details) {
                  const qty = Number(asset.stock_details.quantity || 0);
                  if (qty > 0 && (!asset.stock_details.market_price_usd || Number.isNaN(Number(asset.stock_details.market_price_usd)))) {
                    const m = (valuation.fx_context || '').match(/USDJPY@([0-9.]+)/);
                    const rate = m ? parseFloat(m[1]) : null;
                    if (rate && rate > 0) {
                      const unitUsd = valuation.value_jpy / (qty * rate);
                      if (Number.isFinite(unitUsd) && unitUsd > 0 && unitUsd < 10000) {
                        asset.stock_details.market_price_usd = Math.round(unitUsd * 100) / 100;
                      }
                    }
                  }
                  // 評価額（USD）と損益（USD）を付与
                  const mpu = Number(asset.stock_details.market_price_usd || 0);
                  if (mpu > 0) {
                    const curTotalUsd = mpu * qty;
                    const costTotalUsd = Number(asset.stock_details.avg_price_usd || 0) * qty;
                    asset.stock_details.market_value_usd = Math.round(curTotalUsd * 100) / 100;
                    asset.stock_details.cost_total_usd = Math.round(costTotalUsd * 100) / 100;
                    const gl = curTotalUsd - costTotalUsd;
                    asset.stock_details.gain_loss_usd = Math.round(gl * 100) / 100;
                    asset.stock_details.gain_loss_pct_usd = costTotalUsd > 0 ? Math.round((gl / costTotalUsd) * 10000) / 100 : null;
                    
                    // 為替レート統一: USD建て損益を現在レートで円換算（US株の正しい損益計算）
                    const m = (valuation.fx_context || '').match(/USDJPY@([0-9.]+)/);
                    const currentRate = m ? parseFloat(m[1]) : null;
                    if (currentRate && currentRate > 0) {
                      // USD建て簿価を現在レートで円換算
                      const currentBookValueJpy = Math.floor(costTotalUsd * currentRate);
                      // 円建て損益を再計算（為替レート統一）
                      asset.gain_loss_jpy = asset.current_value_jpy - currentBookValueJpy;
                      asset.gain_loss_percentage = costTotalUsd > 0 ? ((gl / costTotalUsd) * 100).toFixed(2) : "0.00";
                      
                      // 統一レート使用フラグ
                      asset.unified_fx_rate = true;
                      asset.original_book_value_jpy = asset.book_value_jpy;
                      asset.current_book_value_jpy = currentBookValueJpy;
                    }
                  }
                }
              } else {
                // Fallback to legacy calculation
                asset.current_value_jpy = calculateCurrentValue(asset);
              }
              
              // US株以外、または為替統一が適用されていない場合の従来計算
              if (asset.class !== 'us_stock' || !asset.unified_fx_rate) {
                asset.gain_loss_jpy = asset.current_value_jpy - asset.book_value_jpy;
                asset.gain_loss_percentage = ((asset.current_value_jpy - asset.book_value_jpy) / asset.book_value_jpy * 100).toFixed(2);
              }
            
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
        
        // Get latest market valuation for total value (with fx_context for US stocks)
        db.get('SELECT value_jpy, fx_context FROM valuations WHERE asset_id = ? ORDER BY as_of DESC, id DESC LIMIT 1', [asset.id], (err, valuation) => {
          if (!err && valuation && valuation.value_jpy) {
            // Use actual market valuation if available
            asset.current_value_jpy = valuation.value_jpy;
            
            // US株の場合: USD建て損益計算で為替レート統一
            if (asset.class === 'us_stock' && asset.stock_details && valuation.fx_context) {
              const qty = Number(asset.stock_details.quantity || 0);
              const avgPriceUsd = Number(asset.stock_details.avg_price_usd || 0);
              const marketPriceUsd = Number(asset.stock_details.market_price_usd || 0);
              
              if (qty > 0 && avgPriceUsd > 0 && marketPriceUsd > 0) {
                const curTotalUsd = marketPriceUsd * qty;
                const costTotalUsd = avgPriceUsd * qty;
                const glUsd = curTotalUsd - costTotalUsd;
                
                // 現在の為替レートを抽出
                const m = valuation.fx_context.match(/USDJPY@([0-9.]+)/);
                const currentRate = m ? parseFloat(m[1]) : null;
                
                if (currentRate && currentRate > 0) {
                  // USD建て簿価を現在レートで円換算
                  const currentBookValueJpy = Math.floor(costTotalUsd * currentRate);
                  
                  // 円建て損益を再計算（為替レート統一）
                  asset.gain_loss_jpy = asset.current_value_jpy - currentBookValueJpy;
                  asset.gain_loss_percentage = costTotalUsd > 0 ? ((glUsd / costTotalUsd) * 100).toFixed(2) : "0.00";
                  
                  // 追加情報
                  asset.unified_fx_rate = true;
                  asset.original_book_value_jpy = asset.book_value_jpy;
                  asset.current_book_value_jpy = currentBookValueJpy;
                  
                  // USD建て損益情報
                  asset.stock_details.market_value_usd = Math.round(curTotalUsd * 100) / 100;
                  asset.stock_details.cost_total_usd = Math.round(costTotalUsd * 100) / 100;
                  asset.stock_details.gain_loss_usd = Math.round(glUsd * 100) / 100;
                  asset.stock_details.gain_loss_pct_usd = costTotalUsd > 0 ? Math.round((glUsd / costTotalUsd) * 10000) / 100 : null;
                }
              }
            }
          } else {
            // Fallback to legacy calculation
            asset.current_value_jpy = calculateCurrentValue(asset);
          }
          
          // US株以外、または為替統一が適用されていない場合の従来計算
          if (asset.class !== 'us_stock' || !asset.unified_fx_rate) {
            asset.gain_loss_jpy = asset.current_value_jpy - asset.book_value_jpy;
            asset.gain_loss_percentage = ((asset.current_value_jpy - asset.book_value_jpy) / asset.book_value_jpy * 100).toFixed(2);
          }
          
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
  const assetId = parseInt(req.params.id);
  
  
  const {
    class: assetClass,
    quantity,
    avg_price_usd,
    avg_price_jpy,
    weight_g,
    unit_book_cost_jpy_per_gram,
    recalc = 'auto',
    refresh_market = true,
    // Legacy fields for existing functionality
    name,
    note,
    acquired_at,
    book_value_jpy,
    valuation_source,
    liquidity_tier,
    tags
  } = req.body;

  // クラス別の数量/詳細編集トリガー（いずれかのクラス別フィールドが含まれていれば統合処理へ）
  const classSpecificKeys = ['quantity','weight_g','avg_price_usd','avg_price_jpy','purity','unit_price_jpy','exchange','code','ticker'];
  const isClassSpecificEdit = !!assetClass && classSpecificKeys.some(k => Object.prototype.hasOwnProperty.call(req.body, k));
  

  if (isClassSpecificEdit) {
    // 数量・詳細編集の統合処理
    if (!assetClass) {
      return res.status(400).json({ error: 'Asset class is required' });
    }

    // Start immediate transaction
    db.serialize(() => {
      db.run('BEGIN IMMEDIATE', (err) => {
        if (err) {
          return res.status(500).json({ error: 'Failed to start transaction' });
        }

        // Get current asset data
        db.get('SELECT * FROM assets WHERE id = ?', [assetId], (err, asset) => {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: err.message });
          }
          if (!asset) {
            db.run('ROLLBACK');
            return res.status(404).json({ error: 'Asset not found' });
          }
          if (asset.class !== assetClass) {
            db.run('ROLLBACK');
            return res.status(400).json({ error: 'Asset class mismatch' });
          }

          // Update class-specific data
          updateClassSpecificData(asset, assetId, req.body, (err) => {
            if (err) {
              db.run('ROLLBACK');
              return res.status(400).json({ error: err.message });
            }

            // Recalculate book value
            const recalcOptions = {
              class: assetClass,
              recalc,
              newQuantity: quantity,
              newWeight: weight_g,
              avgPriceUsd: avg_price_usd,
              avgPriceJpy: avg_price_jpy,
              unitBookCostJpyPerGram: unit_book_cost_jpy_per_gram
            };

            recalcBookValue(db, assetId, recalcOptions)
              .then(newBookValue => {
                // Update asset book value
                db.run('UPDATE assets SET book_value_jpy = ?, updated_at = ? WHERE id = ?',
                  [newBookValue, new Date().toISOString(), assetId], (err) => {
                    if (err) {
                      db.run('ROLLBACK');
                      return res.status(500).json({ error: err.message });
                    }

                    // Commit transaction
                    db.run('COMMIT', (err) => {
                      if (err) {
                        return res.status(500).json({ error: 'Failed to commit transaction' });
                      }

                      // Return updated asset
                      const updatedAsset = { ...asset, book_value_jpy: newBookValue };
                      res.json({
                        ok: true,
                        asset: updatedAsset
                      });
                    });
                  });
              })
              .catch(err => {
                db.run('ROLLBACK');
                res.status(400).json({ error: err.message });
              });
          });
        });
      });
    });
  } else {
    // Legacy asset field editing logic
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
  }
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

// Helper function to update class-specific data（数量編集と詳細編集を統合）
function updateClassSpecificData(asset, assetId, body, callback) {
  const { class: assetClass } = body;

  if (assetClass === 'us_stock') {
    const updateData = {};
    // 許容フィールド: quantity, avg_price_usd, exchange, ticker
    if (body.quantity !== undefined) {
      const q = Number(body.quantity);
      if (!Number.isInteger(q) || q <= 0) return callback(new Error('Quantity must be a positive integer'));
      updateData.quantity = q;
    }
    if (body.avg_price_usd !== undefined) {
      const p = Number(body.avg_price_usd);
      if (!Number.isFinite(p) || p <= 0) return callback(new Error('avg_price_usd must be a positive number'));
      updateData.avg_price_usd = p;
    }
    if (body.exchange !== undefined) updateData.exchange = String(body.exchange || '');
    if (body.ticker !== undefined) updateData.ticker = String(body.ticker || '').toUpperCase();
    if (Object.keys(updateData).length === 0) return callback(new Error('No editable fields for us_stock'));
    const setClause = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updateData), assetId];
    db.run(`UPDATE us_stocks SET ${setClause} WHERE asset_id = ?`, values, callback);

  } else if (assetClass === 'jp_stock') {
    const updateData = {};
    // 許容フィールド: quantity, avg_price_jpy, code
    if (body.quantity !== undefined) {
      const q = Number(body.quantity);
      if (!Number.isInteger(q) || q <= 0) return callback(new Error('Quantity must be a positive integer'));
      updateData.quantity = q;
    }
    if (body.avg_price_jpy !== undefined) {
      const p = Number(body.avg_price_jpy);
      if (!Number.isFinite(p) || p <= 0) return callback(new Error('avg_price_jpy must be a positive number'));
      updateData.avg_price_jpy = p;
    }
    if (body.code !== undefined) updateData.code = String(body.code || '');
    if (Object.keys(updateData).length === 0) return callback(new Error('No editable fields for jp_stock'));
    const setClause = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updateData), assetId];
    db.run(`UPDATE jp_stocks SET ${setClause} WHERE asset_id = ?`, values, callback);

  } else if (assetClass === 'precious_metal') {
    const updateData = {};
    // 許容フィールド: weight_g, purity, unit_price_jpy
    if (body.weight_g !== undefined) {
      const w = Number(body.weight_g);
      if (!(w > 0)) return callback(new Error('Weight must be a positive number'));
      updateData.weight_g = w;
    }
    if (body.purity !== undefined && body.purity !== null && body.purity !== '') {
      const pu = Number(body.purity);
      if (!(pu > 0 && pu <= 1)) return callback(new Error('purity must be within (0, 1]'));
      updateData.purity = pu;
    }
    if (body.unit_price_jpy !== undefined) {
      const up = Number(body.unit_price_jpy);
      if (!Number.isFinite(up) || up <= 0) return callback(new Error('unit_price_jpy must be a positive number'));
      updateData.unit_price_jpy = up;
    }
    if (Object.keys(updateData).length === 0) return callback(new Error('No editable fields for precious_metal'));
    const setClause = Object.keys(updateData).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updateData), assetId];
    db.run(`UPDATE precious_metals SET ${setClause} WHERE asset_id = ?`, values, callback);

  } else {
    callback(new Error('Unsupported asset class for editing'));
  }
}

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

// CSV Export (existing template endpoint)
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

// Full Database CSV Export
app.get('/api/export/full-database', requireAuth, (req, res) => {
  // Get all assets with their complete details
  const query = `
    SELECT 
      a.*,
      us.ticker, us.exchange, us.quantity as us_quantity, us.avg_price_usd, us.market_price_usd,
      jp.code, jp.quantity as jp_quantity, jp.avg_price_jpy,
      pm.metal, pm.weight_g, pm.purity, pm.unit_price_jpy,
      w.brand, w.model, w.ref, w.box_papers,
      re.address, re.land_area_sqm, re.building_area_sqm, re.rights,
      c.category, c.variant,
      ca.currency, ca.balance,
      v.value_jpy as current_value_jpy, v.as_of as valuation_date, v.fx_context
    FROM assets a
    LEFT JOIN us_stocks us ON a.id = us.asset_id
    LEFT JOIN jp_stocks jp ON a.id = jp.asset_id
    LEFT JOIN precious_metals pm ON a.id = pm.asset_id
    LEFT JOIN watches w ON a.id = w.asset_id
    LEFT JOIN real_estates re ON a.id = re.asset_id
    LEFT JOIN collections c ON a.id = c.asset_id
    LEFT JOIN cashes ca ON a.id = ca.asset_id
    LEFT JOIN (
      SELECT asset_id, value_jpy, as_of, fx_context,
             ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY as_of DESC, id DESC) as rn
      FROM valuations
    ) v ON a.id = v.asset_id AND v.rn = 1
    ORDER BY a.class, a.name
  `;
  
  db.all(query, (err, rows) => {
    if (err) {
      console.error('Database export error:', err);
      return res.status(500).json({ error: 'データベースエクスポートに失敗しました' });
    }
    
    // Create comprehensive CSV with all data
    const csvHeaders = [
      // Basic asset info
      'id', 'class', 'name', 'note', 'acquired_at', 'book_value_jpy', 
      'valuation_source', 'liquidity_tier', 'tags', 'created_at', 'updated_at',
      // Current market value
      'current_value_jpy', 'valuation_date', 'fx_context',
      // US stock details
      'ticker', 'exchange', 'us_quantity', 'avg_price_usd',
      // JP stock details
      'code', 'jp_quantity', 'avg_price_jpy',
      // Precious metal details
      'metal', 'weight_g', 'purity', 'unit_price_jpy',
      // Watch details
      'brand', 'model', 'ref', 'box_papers',
      // Real estate details
      'address', 'land_area_sqm', 'building_area_sqm', 'rights',
      // Collection details
      'category', 'variant',
      // Cash details
      'currency', 'balance'
    ];
    
    const csvWriter = createCsvWriter({
      path: path.join(__dirname, 'data', 'full_database_export.csv'),
      header: csvHeaders.map(id => ({ id, title: id }))
    });
    
    // Map database rows to CSV format
    const csvData = rows.map(row => {
      const mapped = {};
      csvHeaders.forEach(header => {
        mapped[header] = row[header] || '';
      });
      return mapped;
    });
    
    csvWriter.writeRecords(csvData)
      .then(() => {
        res.setHeader('Content-Disposition', `attachment; filename="assets_database_${new Date().toISOString().slice(0, 10)}.csv"`);
        res.setHeader('Content-Type', 'text/csv');
        res.download(path.join(__dirname, 'data', 'full_database_export.csv'), (err) => {
          if (err) {
            console.error('File download error:', err);
            res.status(500).json({ error: 'ファイルダウンロードに失敗しました' });
          } else {
            // Log the export action
            logAudit('database', null, 'FULL_EXPORT', null, { record_count: rows.length }, 
              req.session.user ? req.session.user.id : 'guest');
          }
        });
      })
      .catch(error => {
        console.error('CSV generation error:', error);
        res.status(500).json({ error: 'CSVファイル生成に失敗しました' });
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

// GET /api/market/fx/:pair - Get specific FX rate
app.get('/api/market/fx/:pair', async (req, res) => {
  const pair = req.params.pair.toUpperCase();
  
  if (!['USDJPY', 'CNYJPY'].includes(pair)) {
    return res.status(400).json({ error: 'Unsupported currency pair' });
  }

  try {
    const key = `fx:${pair}`;
    const cached = await getCachedPrice(key, CACHE_TTL.fx);
    
    if (cached) {
      return res.json({
        pair: pair,
        rate: cached.data.price,
        currency: 'JPY',
        asOf: cached.data.asOf,
        stale: cached.stale
      });
    } else {
      // If no cached data, try to get fresh rate from provider
      try {
        const freshRate = await fxProvider.getRate(pair);
        if (freshRate && freshRate.price) {
          // Cache the fresh rate
          await setCachedPrice(`fx:${pair}`, {
            price: freshRate.price,
            asOf: freshRate.asOf || new Date().toISOString()
          });
          
          return res.json({
            pair: pair,
            rate: freshRate.price,
            currency: 'JPY',
            asOf: freshRate.asOf || new Date().toISOString(),
            stale: false,
            source: freshRate.source || fxProvider.name
          });
        }
      } catch (providerError) {
        console.error(`FX provider error for ${pair}:`, providerError.message);
      }
      
      return res.status(404).json({ error: 'No rate data available' });
    }
  } catch (error) {
    console.error('FX rate fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch FX rate' });
  }
});

// Comparable Sales API (list/add/update/delete, estimate & commit)
app.get('/api/assets/:assetId/comps', requireAuth, async (req, res) => {
  try {
    const assetId = Number(req.params.assetId);
    const comps = await Comps.listComps(db, assetId, 200);
    res.json({ comps });
  } catch (e) { res.status(500).json({ error: 'failed_to_list_comps' }); }
});

app.post('/api/assets/:assetId/comps', requireAdmin, async (req, res) => {
  try {
    const assetId = Number(req.params.assetId);
    await Comps.addComp(db, assetId, req.body || {});
    const comps = await Comps.listComps(db, assetId, 200);
    res.json({ success: true, comps });
  } catch (e) { res.status(400).json({ error: e.message || 'failed_to_add_comp' }); }
});

app.put('/api/comps/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await Comps.updateComp(db, id, req.body || {});
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message || 'failed_to_update_comp' }); }
});

app.delete('/api/comps/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    await Comps.deleteComp(db, id);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ error: e.message || 'failed_to_delete_comp' }); }
});

app.get('/api/assets/:assetId/comps/estimate', requireAuth, async (req, res) => {
  try {
    const assetId = Number(req.params.assetId);
    const method = (req.query.method || 'wmad');
    const halfLife = Number(req.query.halfLifeDays || 90);
    const est = await Comps.estimateFromComps(db, assetId, method, halfLife);
    res.json(est);
  } catch (e) { res.status(400).json({ error: e.message || 'failed_to_estimate' }); }
});

app.post('/api/assets/:assetId/comps/commit', requireAdmin, async (req, res) => {
  try {
    const assetId = Number(req.params.assetId);
    const method = (req.body?.method || 'wmad');
    const halfLife = Number(req.body?.halfLifeDays || 90);
    const est = await Comps.estimateFromComps(db, assetId, method, halfLife);
    await Comps.commitValuation(db, assetId, est);
    res.json({ success: true, estimate: est });
  } catch (e) { res.status(400).json({ error: e.message || 'failed_to_commit_estimate' }); }
});

// Rebalance API (targets, tolerance, current, plan)
app.get('/api/rebalance/targets', requireAuth, async (req, res) => {
  try {
    const [targets, tol] = await Promise.all([
      Rebalance.getTargets(db),
      Rebalance.getTolerancePct(db)
    ]);
    res.json({ targets, tolerance_pct: tol });
  } catch (e) { res.status(500).json({ error: 'failed_to_get_targets' }); }
});

app.post('/api/rebalance/targets', requireAdmin, async (req, res) => {
  try {
    const targets = Array.isArray(req.body?.targets) ? req.body.targets : [];
    if (req.body?.tolerance_pct !== undefined) {
      await Rebalance.setTolerancePct(db, Number(req.body.tolerance_pct));
    }
    if (targets.length) await Rebalance.setTargets(db, targets);
    const [newTargets, tol] = await Promise.all([
      Rebalance.getTargets(db),
      Rebalance.getTolerancePct(db)
    ]);
    res.json({ success: true, targets: newTargets, tolerance_pct: tol });
  } catch (e) { res.status(400).json({ error: e.message || 'failed_to_set_targets' }); }
});

app.get('/api/rebalance/plan', requireAuth, async (req, res) => {
  try {
    const to = (req.query.to || 'target'); // or 'mid'
    const minTrade = Number(req.query.minTrade || 0);
    const current = await Rebalance.getCurrentByClass(db, true);
    const targets = await Rebalance.getTargets(db);
    const tol = await Rebalance.getTolerancePct(db);
    const plan = Rebalance.computePlanFromTargets(current, targets, tol, to, minTrade);
    res.json({ current, targets, tolerance_pct: tol, plan });
  } catch (e) { res.status(500).json({ error: 'failed_to_compute_plan' }); }
});

// Settings: backup toggle
async function getSettingValue(key, defaultVal=null) {
  return await new Promise((resolve) => {
    db.get('SELECT value FROM settings WHERE key=?', [key], (err, row) => {
      if (err || !row) return resolve(defaultVal);
      resolve(row.value);
    });
  });
}

app.get('/api/settings/backup', requireAuth, async (req, res) => {
  try {
    const v = await getSettingValue('backup_enable', '1');
    res.json({ backup_enable: v === '1' });
  } catch { res.status(500).json({ error: 'failed_to_get_backup_setting' }); }
});

app.post('/api/settings/backup', requireAdmin, async (req, res) => {
  try {
    const enable = !!req.body?.enable;
    db.run(`INSERT INTO settings(key,value) VALUES('backup_enable',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`, [enable ? '1' : '0'], (err) => {
      if (err) return res.status(500).json({ error: 'failed_to_update_backup_setting' });
      res.json({ success: true, backup_enable: enable });
    });
  } catch { res.status(400).json({ error: 'bad_request' }); }
});

// Duplicate Detection and Management API endpoints

// GET /api/duplicates - Find duplicate assets
app.get('/api/duplicates', requireAuth, async (req, res) => {
  try {
    const duplicateGroups = await duplicateService.findDuplicates();
    
    // Filter out groups with ignored duplicates from audit log
    const filteredGroups = [];
    
    for (const group of duplicateGroups) {
      const assetIds = group.assets.map(a => a.id);
      
      // Check if this group has been marked as "not duplicate"
      const ignoredCheck = await new Promise((resolve) => {
        db.get(
          `SELECT id FROM audit_log 
           WHERE action = 'IGNORE_DUPLICATES' 
           AND new_values LIKE '%${assetIds.join(',')}%' 
           ORDER BY created_at DESC LIMIT 1`,
          (err, row) => {
            resolve(!!row);
          }
        );
      });
      
      if (!ignoredCheck) {
        filteredGroups.push(group);
      }
    }
    
    res.json({
      duplicate_groups: filteredGroups,
      total_groups: filteredGroups.length,
      total_assets: filteredGroups.reduce((sum, group) => sum + group.count, 0)
    });
  } catch (error) {
    console.error('Duplicate detection error:', error);
    res.status(500).json({ error: 'Failed to detect duplicates' });
  }
});

// POST /api/duplicates/merge - Merge duplicate assets
app.post('/api/duplicates/merge', requireAdmin, async (req, res) => {
  const { asset_ids, keep_asset_id } = req.body;
  
  if (!asset_ids || !Array.isArray(asset_ids) || asset_ids.length < 2) {
    return res.status(400).json({ error: 'At least 2 asset IDs required for merge' });
  }
  
  if (!keep_asset_id || !asset_ids.includes(keep_asset_id)) {
    return res.status(400).json({ error: 'Keep asset ID must be in the list of assets to merge' });
  }
  
  try {
    const result = await duplicateService.mergeDuplicates(
      asset_ids,
      keep_asset_id,
      req.session.user.id
    );
    
    res.json(result);
  } catch (error) {
    console.error('Duplicate merge error:', error);
    res.status(500).json({ error: 'Failed to merge duplicates' });
  }
});

// POST /api/duplicates/ignore - Mark assets as not duplicates
app.post('/api/duplicates/ignore', requireAdmin, async (req, res) => {
  const { asset_ids } = req.body;
  
  if (!asset_ids || !Array.isArray(asset_ids) || asset_ids.length < 2) {
    return res.status(400).json({ error: 'At least 2 asset IDs required' });
  }
  
  try {
    const result = await duplicateService.markAsNotDuplicates(
      asset_ids,
      req.session.user.id
    );
    
    res.json(result);
  } catch (error) {
    console.error('Duplicate ignore error:', error);
    res.status(500).json({ error: 'Failed to ignore duplicates' });
  }
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
async function backupDatabase() {
  const backupDir = path.join(__dirname, 'backup');
  
  // Ensure backup directory exists
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  const now = new Date();
  const timestamp = now.toISOString().slice(0, 19).replace(/[:-]/g, '').replace('T', '_');
  const backupPath = path.join(backupDir, `portfolio_${timestamp}.db`);
  
  try {
    const backupEnabled = await getSettingValue('backup_enable', '1');
    if (backupEnabled !== '1') {
      console.log('Database backup skipped (backup_enable=0)');
      return;
    }
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
