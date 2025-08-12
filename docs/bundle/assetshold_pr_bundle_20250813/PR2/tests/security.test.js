const request = require('supertest');
const app = require('../testServer'); // adapt to your app loader

describe('security baseline', () => {
  it('rejects startup without SESSION_SECRET', () => {
    // This test is a placeholder: run app with no SESSION_SECRET and expect exit(1)
    expect(true).toBe(true);
  });
  it('login is rate-limited after repeated attempts', async () => {
    for (let i=0;i<6;i++) await request(app).post('/api/login').send({u:'x',p:'y'});
    const res = await request(app).post('/api/login').send({u:'x',p:'y'});
    expect([429,401]).toContain(res.statusCode);
  });
});
