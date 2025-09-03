const request = require('supertest');
const bcrypt = require('bcrypt');

// Import the running app (uses sqlite DB at data/portfolio.db)
const app = require('../server');

describe('月次推移の累計表示', () => {
  let agent;

  beforeAll(async () => {
    agent = request.agent(app);
    const db = app.get('db');

    // Ensure an admin user exists and can login
    async function ensureAdmin(username, password) {
      const hash = await bcrypt.hash(password, 10);
      await new Promise((resolve, reject) => {
        db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
          if (err) return reject(err);
          if (row && row.id) {
            db.run('UPDATE users SET password_hash = ?, role = ? WHERE id = ?', [hash, 'admin', row.id], (e) => e ? reject(e) : resolve());
          } else {
            db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)', [username, hash, 'admin'], (e) => e ? reject(e) : resolve());
          }
        });
      });
    }

    await ensureAdmin('admin', 'admin123');
    const loginResp = await agent.post('/api/login').send({ username: 'admin', password: 'admin123' });
    if (loginResp.status !== 200) {
      throw new Error('Failed to login test admin');
    }
  });

  it('過去3ヶ月の累計が前月までの合計に当月分を上乗せして増加する', async () => {
    const db = app.get('db');

    const now = new Date();
    const keyOf = (offset) => {
      const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      return `${y}-${m}`;
    };

    const baseline = await agent.get('/api/dashboard/monthly-trend');
    const baseItems = baseline.body?.items || [];

    // Helper to create a simple asset and move it to a target month
    async function createWatchAssetInMonth(name, bookJpy, monthOffset) {
      const resp = await agent
        .post('/api/assets')
        .send({
          class: 'watch',
          name,
          book_value_jpy: bookJpy,
          liquidity_tier: 'L3',
          note: 'jest-cumulative'
        })
        .expect(201);
      const assetId = resp.body?.created_asset_id || resp.body?.asset?.id;

      // Update created_at to the 1st of target month (SQLite TEXT datetime)
      const d = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
      const createdAt = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01 00:00:00`;
      await new Promise((resolve, reject) => {
        db.run('UPDATE assets SET created_at = ? WHERE id = ?', [createdAt, assetId], (err) => (err ? reject(err) : resolve()));
      });

      return assetId;
    }

    // Create 3 assets across -2, -1, 0 months with specified book values
    const idM2 = await createWatchAssetInMonth('Cum M-2', 100, 2);
    const idM1 = await createWatchAssetInMonth('Cum M-1', 200, 1);
    const idM0 = await createWatchAssetInMonth('Cum M0', 200, 0);

    // Insert valuations to define market values (latest snapshot used by query)
    const asOf = new Date().toISOString();
    await new Promise((resolve, reject) => {
      db.run('INSERT INTO valuations (asset_id, as_of, value_jpy, unit_price_jpy, fx_context) VALUES (?, ?, ?, ?, ?)', [idM2, asOf, 200, null, null], (e) => e ? reject(e) : resolve());
    });
    await new Promise((resolve, reject) => {
      db.run('INSERT INTO valuations (asset_id, as_of, value_jpy, unit_price_jpy, fx_context) VALUES (?, ?, ?, ?, ?)', [idM1, asOf, 300, null, null], (e) => e ? reject(e) : resolve());
    });
    await new Promise((resolve, reject) => {
      db.run('INSERT INTO valuations (asset_id, as_of, value_jpy, unit_price_jpy, fx_context) VALUES (?, ?, ?, ?, ?)', [idM0, asOf, 300, null, null], (e) => e ? reject(e) : resolve());
    });

    // Fetch after state
    const after = await agent.get('/api/dashboard/monthly-trend');
    const afterItems = after.body?.items || [];

    // Extract helper
    const findByKey = (items, key) => items.find(x => x.month === key) || { book_value_total: 0, market_value_total: 0 };

    const kM2 = keyOf(2);
    const kM1 = keyOf(1);
    const kM0 = keyOf(0);

    // Compute deltas of cumulative totals between after and baseline
    const deltaBookM2 = (findByKey(afterItems, kM2).book_value_total || 0) - (findByKey(baseItems, kM2).book_value_total || 0);
    const deltaBookM1 = (findByKey(afterItems, kM1).book_value_total || 0) - (findByKey(baseItems, kM1).book_value_total || 0);
    const deltaBookM0 = (findByKey(afterItems, kM0).book_value_total || 0) - (findByKey(baseItems, kM0).book_value_total || 0);

    const deltaMarketM2 = (findByKey(afterItems, kM2).market_value_total || 0) - (findByKey(baseItems, kM2).market_value_total || 0);
    const deltaMarketM1 = (findByKey(afterItems, kM1).market_value_total || 0) - (findByKey(baseItems, kM1).market_value_total || 0);
    const deltaMarketM0 = (findByKey(afterItems, kM0).market_value_total || 0) - (findByKey(baseItems, kM0).market_value_total || 0);

    // Expect cumulative deltas: book [100, 300, 500], market [200, 500, 800]
    expect(deltaBookM2).toBe(100);
    expect(deltaBookM1).toBe(300);
    expect(deltaBookM0).toBe(500);

    expect(deltaMarketM2).toBe(200);
    expect(deltaMarketM1).toBe(500);
    expect(deltaMarketM0).toBe(800);
  });

  afterAll(async () => {
    // Close DB to avoid open handles in Jest
    const db = app.get('db');
    await new Promise((resolve) => db.close(() => resolve()));
  });
});
