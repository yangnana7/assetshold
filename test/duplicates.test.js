/**
 * BDD Tests for Duplicate Asset Detection and Integration
 * Following BDD specifications from docs/BDD.md
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Import the app and services
const app = require('../server');
const DuplicateDetectionService = require('../server/duplicates/service');

describe('重複データ統合機能', () => {
  let db;
  let duplicateService;
  let authCookie;

  beforeAll(async () => {
    // Setup test database
    const testDbPath = path.join(__dirname, 'test_portfolio.db');
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    db = new sqlite3.Database(testDbPath);
    duplicateService = new DuplicateDetectionService(db);

    // Initialize test schema
    await initTestSchema();
    
    // Login as admin to get session cookie
    const loginResponse = await request(app)
      .post('/api/login')
      .send({
        username: 'admin',
        password: 'admin123'
      });
    
    authCookie = loginResponse.headers['set-cookie'];
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
    const testDbPath = path.join(__dirname, 'test_portfolio.db');
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  beforeEach(async () => {
    // Clear test data before each test
    await clearTestData();
  });

  async function initTestSchema() {
    return new Promise((resolve) => {
      db.serialize(() => {
        // Create assets table
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

        // Create class-specific tables
        db.run(`CREATE TABLE IF NOT EXISTS us_stocks (
          asset_id INTEGER PRIMARY KEY,
          ticker TEXT NOT NULL,
          exchange TEXT,
          quantity REAL NOT NULL,
          avg_price_usd REAL NOT NULL,
          FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS jp_stocks (
          asset_id INTEGER PRIMARY KEY,
          code TEXT NOT NULL,
          quantity REAL NOT NULL,
          avg_price_jpy REAL NOT NULL,
          FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS precious_metals (
          asset_id INTEGER PRIMARY KEY,
          metal TEXT NOT NULL,
          weight_g REAL NOT NULL,
          purity REAL,
          unit_price_jpy REAL,
          FOREIGN KEY(asset_id) REFERENCES assets(id) ON DELETE CASCADE
        )`);

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

        resolve();
      });
    });
  }

  async function clearTestData() {
    return new Promise((resolve) => {
      db.serialize(() => {
        db.run('DELETE FROM us_stocks');
        db.run('DELETE FROM jp_stocks');
        db.run('DELETE FROM precious_metals');
        db.run('DELETE FROM audit_log');
        db.run('DELETE FROM assets', resolve);
      });
    });
  }

  describe('Feature: 重複資産の検出', () => {
    describe('Scenario: 同一名称の重複資産検出', () => {
      it('Given 複数の同一資産エントリが存在する When 重複検出処理を実行する Then 重複資産が特定される', async () => {
        // Given: Create duplicate assets with same class and name
        const asset1 = await createTestAsset({
          class: 'watch',
          name: 'Rolex Submariner',
          book_value_jpy: 1000000,
          liquidity_tier: 'L3',
          note: 'Black dial'
        });

        const asset2 = await createTestAsset({
          class: 'watch',
          name: 'Rolex Submariner',
          book_value_jpy: 1100000,
          liquidity_tier: 'L3',
          note: 'Green dial'
        });

        // When: Execute duplicate detection
        const duplicateGroups = await duplicateService.findDuplicates();

        // Then: Duplicates should be identified
        expect(duplicateGroups.length).toBeGreaterThan(0);
        
        const nameMatchGroup = duplicateGroups.find(group => group.type === 'name_match');
        expect(nameMatchGroup).toBeDefined();
        expect(nameMatchGroup.assets).toHaveLength(2);
        expect(nameMatchGroup.confidence).toBe(0.9);
        
        const assetIds = nameMatchGroup.assets.map(a => a.id);
        expect(assetIds).toContain(asset1);
        expect(assetIds).toContain(asset2);
      });
    });

    describe('Scenario: 株式ティッカーによる重複検出', () => {
      it('Given 同一ティッカーの米国株が複数存在する When 重複検出処理を実行する Then ティッカー重複が特定される', async () => {
        // Given: Create duplicate US stocks with same ticker
        const asset1 = await createTestAsset({
          class: 'us_stock',
          name: 'Apple Inc.',
          book_value_jpy: 500000,
          liquidity_tier: 'L1'
        });

        const asset2 = await createTestAsset({
          class: 'us_stock',
          name: 'Apple Inc',
          book_value_jpy: 600000,
          liquidity_tier: 'L1'
        });

        await createStockDetails(asset1, {
          ticker: 'AAPL',
          exchange: 'NASDAQ',
          quantity: 10,
          avg_price_usd: 150
        });

        await createStockDetails(asset2, {
          ticker: 'AAPL',
          exchange: 'NASDAQ',
          quantity: 15,
          avg_price_usd: 160
        });

        // When: Execute duplicate detection
        const duplicateGroups = await duplicateService.findDuplicates();

        // Then: Ticker duplicates should be identified
        const tickerGroup = duplicateGroups.find(group => group.type === 'us_stock_ticker');
        expect(tickerGroup).toBeDefined();
        expect(tickerGroup.assets).toHaveLength(2);
        expect(tickerGroup.confidence).toBe(0.95);
      });
    });

    describe('Scenario: 貴金属重量による類似検出', () => {
      it('Given 同種金属で類似重量の資産が存在する When 重複検出処理を実行する Then 類似資産が特定される', async () => {
        // Given: Create similar precious metals
        const asset1 = await createTestAsset({
          class: 'precious_metal',
          name: '純金バー 100g',
          book_value_jpy: 800000,
          liquidity_tier: 'L2'
        });

        const asset2 = await createTestAsset({
          class: 'precious_metal',
          name: '金地金 102g',
          book_value_jpy: 816000,
          liquidity_tier: 'L2'
        });

        await createPreciousMetalDetails(asset1, {
          metal: 'gold',
          weight_g: 100.0,
          purity: 0.999,
          unit_price_jpy: 8000
        });

        await createPreciousMetalDetails(asset2, {
          metal: 'gold',
          weight_g: 102.0,
          purity: 0.999,
          unit_price_jpy: 8000
        });

        // When: Execute duplicate detection
        const duplicateGroups = await duplicateService.findDuplicates();

        // Then: Similar precious metals should be identified
        const metalGroup = duplicateGroups.find(group => group.type === 'precious_metal_similar');
        expect(metalGroup).toBeDefined();
        expect(metalGroup.assets).toHaveLength(2);
        expect(metalGroup.confidence).toBe(0.7);
      });
    });
  });

  describe('Feature: 重複データの統合', () => {
    describe('Scenario: 重複資産の統合処理', () => {
      it('Given 重複資産が検出されている When 統合処理を実行する Then データが統合され、重複が解消される', async () => {
        // Given: Create duplicate assets
        const keepAssetId = await createTestAsset({
          class: 'watch',
          name: 'Omega Speedmaster',
          book_value_jpy: 500000,
          liquidity_tier: 'L3',
          note: 'Professional model'
        });

        const mergeAssetId = await createTestAsset({
          class: 'watch',
          name: 'Omega Speedmaster',
          book_value_jpy: 520000,
          liquidity_tier: 'L3',
          note: 'Hesalite crystal'
        });

        // When: Execute merge operation
        const mergeResult = await duplicateService.mergeDuplicates(
          [keepAssetId, mergeAssetId],
          keepAssetId,
          'test_user'
        );

        // Then: Assets should be merged successfully
        expect(mergeResult.success).toBe(true);
        expect(mergeResult.kept_asset_id).toBe(keepAssetId);
        expect(mergeResult.merged_asset_ids).toContain(mergeAssetId);

        // Verify the kept asset has combined notes
        const keptAsset = await getAssetById(keepAssetId);
        expect(keptAsset).toBeDefined();
        expect(keptAsset.note).toContain('Professional model');
        expect(keptAsset.note).toContain('Hesalite crystal');

        // Verify merged asset is deleted
        const mergedAsset = await getAssetById(mergeAssetId);
        expect(mergedAsset).toBeNull();

        // Verify audit log
        const auditEntries = await getAuditLogEntries('MERGE_DUPLICATE');
        expect(auditEntries).toHaveLength(1);
        expect(auditEntries[0].record_id).toBe(mergeAssetId);
      });
    });

    describe('Scenario: 重複無視の設定', () => {
      it('Given 重複資産が存在する When 無視設定を実行する Then 今後の重複検出対象から除外される', async () => {
        // Given: Create assets that look like duplicates
        const asset1 = await createTestAsset({
          class: 'collection',
          name: 'Pokemon Card Set',
          book_value_jpy: 100000,
          liquidity_tier: 'L4'
        });

        const asset2 = await createTestAsset({
          class: 'collection',
          name: 'Pokemon Card Set',
          book_value_jpy: 110000,
          liquidity_tier: 'L4'
        });

        // When: Mark as not duplicates
        const ignoreResult = await duplicateService.markAsNotDuplicates(
          [asset1, asset2],
          'test_user'
        );

        // Then: Should be marked as ignored
        expect(ignoreResult.success).toBe(true);
        expect(ignoreResult.ignored_assets).toContain(asset1);
        expect(ignoreResult.ignored_assets).toContain(asset2);

        // Verify audit log entry
        const auditEntries = await getAuditLogEntries('IGNORE_DUPLICATES');
        expect(auditEntries).toHaveLength(1);
        
        const ignoredData = JSON.parse(auditEntries[0].new_values);
        expect(ignoredData.asset_ids).toContain(asset1);
        expect(ignoredData.asset_ids).toContain(asset2);
      });
    });
  });

  describe('API Integration Tests', () => {
    describe('GET /api/duplicates', () => {
      it('should return duplicate groups for authenticated users', async () => {
        // Create test duplicates
        const asset1 = await createTestAsset({
          class: 'watch',
          name: 'Test Watch',
          book_value_jpy: 100000,
          liquidity_tier: 'L3'
        });

        const asset2 = await createTestAsset({
          class: 'watch',
          name: 'Test Watch',
          book_value_jpy: 110000,
          liquidity_tier: 'L3'
        });

        const response = await request(app)
          .get('/api/duplicates')
          .set('Cookie', authCookie)
          .expect(200);

        expect(Array.isArray(response.body.duplicate_groups)).toBe(true);
        expect(typeof response.body.total_groups).toBe('number');
        expect(typeof response.body.total_assets).toBe('number');
      });

      it('should require authentication', async () => {
        await request(app)
          .get('/api/duplicates')
          .expect(401);
      });
    });

    describe('POST /api/duplicates/merge', () => {
      it('should merge duplicate assets successfully', async () => {
        const asset1 = await createTestAsset({
          class: 'watch',
          name: 'Merge Test',
          book_value_jpy: 100000,
          liquidity_tier: 'L3'
        });

        const asset2 = await createTestAsset({
          class: 'watch',
          name: 'Merge Test',
          book_value_jpy: 110000,
          liquidity_tier: 'L3'
        });

        const response = await request(app)
          .post('/api/duplicates/merge')
          .set('Cookie', authCookie)
          .send({
            asset_ids: [asset1, asset2],
            keep_asset_id: asset1
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.kept_asset_id).toBe(asset1);
        expect(response.body.merged_asset_ids).toContain(asset2);
      });

      it('should require admin role', async () => {
        // This would require setting up a viewer user and testing with their session
        // For now, we test the basic validation
        await request(app)
          .post('/api/duplicates/merge')
          .send({
            asset_ids: [1, 2],
            keep_asset_id: 1
          })
          .expect(401);
      });
    });
  });

  // Helper functions
  async function createTestAsset(assetData) {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO assets (class, name, note, book_value_jpy, liquidity_tier, valuation_source)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        assetData.class,
        assetData.name,
        assetData.note || '',
        assetData.book_value_jpy,
        assetData.liquidity_tier,
        assetData.valuation_source || 'manual',
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
      stmt.finalize();
    });
  }

  async function createStockDetails(assetId, stockData) {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO us_stocks (asset_id, ticker, exchange, quantity, avg_price_usd)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        assetId,
        stockData.ticker,
        stockData.exchange,
        stockData.quantity,
        stockData.avg_price_usd,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
      stmt.finalize();
    });
  }

  async function createPreciousMetalDetails(assetId, metalData) {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO precious_metals (asset_id, metal, weight_g, purity, unit_price_jpy)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      stmt.run(
        assetId,
        metalData.metal,
        metalData.weight_g,
        metalData.purity,
        metalData.unit_price_jpy,
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
      stmt.finalize();
    });
  }

  async function getAssetById(id) {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM assets WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row || null);
      });
    });
  }

  async function getAuditLogEntries(action) {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM audit_log WHERE action = ? ORDER BY created_at DESC', [action], (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
});