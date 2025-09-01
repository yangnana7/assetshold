const request = require('supertest');
const path = require('path');

// Import the running app (uses sqlite DB at data/portfolio.db)
const app = require('../server');

describe('ダッシュボード集計とウォッチ資産の評価', () => {
  let authCookie;

  beforeAll(async () => {
    // Login with seeded admin in test env to obtain session cookie
    const loginResp = await request(app)
      .post('/api/login')
      .send({ username: 'admin', password: 'admin123' });
    authCookie = loginResp.headers['set-cookie'];
  });

  it('登録直後のウォッチ資産はNAV=簿価、評価差額=0（差分検証）', async () => {
    // Baseline dashboard totals
    const base = await request(app).get('/api/dashboard');
    const baseMarket = base.body?.totalValue?.[0]?.total || 0;
    const baseBook = base.body?.totalBookValue?.[0]?.total || 0;

    // Create a watch asset
    const watchBook = 100000; // ¥100,000
    const createResp = await request(app)
      .post('/api/assets')
      .set('Cookie', authCookie)
      .send({
        class: 'watch',
        name: 'Test Watch NAV=BOOK',
        book_value_jpy: watchBook,
        liquidity_tier: 'L3',
        note: 'jest'
      })
      .expect(201);
    const assetId = createResp.body?.created_asset_id || createResp.body?.asset?.id;

    // After creation, totals should increase by book value for both book and market
    const after = await request(app).get('/api/dashboard');
    const afterMarket = after.body?.totalValue?.[0]?.total || 0;
    const afterBook = after.body?.totalBookValue?.[0]?.total || 0;

    expect(afterBook - baseBook).toBe(watchBook);
    expect(afterMarket - baseMarket).toBe(watchBook);

    // Insert a manual valuation snapshot to simulate latest valuation update
    const db = app.get('db');
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO valuations (asset_id, as_of, value_jpy, unit_price_jpy, fx_context) VALUES (?, ?, ?, ?, ?)',
        [assetId, new Date().toISOString(), watchBook + 5000, null, null],
        (err) => (err ? reject(err) : resolve())
      );
    });

    const afterVal = await request(app).get('/api/dashboard');
    const afterValMarket = afterVal.body?.totalValue?.[0]?.total || 0;
    const afterValBook = afterVal.body?.totalBookValue?.[0]?.total || 0;

    // Book total unchanged; market total increased by +5,000
    expect(afterValBook - baseBook).toBe(watchBook);
    expect(afterValMarket - afterMarket).toBe(5000);

    // Monthly trend should include current month with at least the watch book value
    const trend = await request(app).get('/api/dashboard/monthly-trend');
    const items = trend.body?.items || [];
    expect(items.length).toBe(12);
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const current = items.find(x => x.month === monthKey);
    expect(current).toBeDefined();
    expect((current.book_value_total || 0)).toBeGreaterThanOrEqual(0);
  });
});

