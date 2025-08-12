const request = require('supertest');
const app = require('../testServer'); // adapt

describe('market status', () => {
  it('is 403 when MARKET_ENABLE=0', async () => {
    const res = await request(app).post('/api/valuations/1/refresh');
    expect(res.statusCode).toBe(403);
  });
});
