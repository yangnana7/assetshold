const request = require('supertest');
const app = require('../testServer'); // adapt

describe('CSV import strictness', () => {
  it('rejects bad date format', async () => {
    const badCsv = "class,name,acquired_at,book_value_jpy,liquidity_tier\nus_stock,AMD,15-2024-12,10000,L1\n";
    const res = await request(app).post('/api/import').attach('file', Buffer.from(badCsv), 'bad.csv');
    expect([400,422,500]).toContain(res.statusCode);
  });
});
