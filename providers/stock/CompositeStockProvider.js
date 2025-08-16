const { PricePoint, StockProvider } = require('../base');
const { YahooStockProvider } = require('../yahoo');
const GoogleFinanceStockProvider = require('./GoogleFinanceStockProvider');

/**
 * CompositeStockProvider
 * - Queries multiple upstreams (Yahoo → Google) and selects a reliable quote
 * - Strategy:
 *   1) Try Yahoo. If success, tentatively accept.
 *   2) Try Google. If also success, compare.
 *      - Prefer quotes with expected currency (JP: JPY, US: USD)
 *      - If both in same currency and differ within 8%, take Yahoo by default
 *      - If differ > 8%, take the median of available sources (2 sources → average)
 *   3) If both fail, throw error.
 */
class CompositeStockProvider extends StockProvider {
  constructor() {
    super('composite');
    this.yahoo = new YahooStockProvider();
    this.google = new GoogleFinanceStockProvider();
  }

  _expectedCurrency(exchange) {
    return exchange === 'JP' ? 'JPY' : 'USD';
  }

  _selectBest(ticker, exchange, quotes) {
    const expected = this._expectedCurrency(exchange);
    const valid = quotes.filter(q => q && typeof q.price === 'number' && q.price > 0);
    if (valid.length === 0) throw new Error('quote_unavailable');
    if (valid.length === 1) return valid[0];

    // Prefer expected currency
    const sameCurrency = valid.filter(q => q.currency === expected);
    const candidates = sameCurrency.length ? sameCurrency : valid;

    if (candidates.length === 1) return candidates[0];

    // Compare difference
    const p1 = candidates[0].price;
    const p2 = candidates[1].price;
    const hi = Math.max(p1, p2);
    const lo = Math.min(p1, p2);
    const diffPct = (hi - lo) / ((p1 + p2) / 2);

    if (diffPct <= 0.08) {
      // Close enough: prefer Yahoo when present
      const yahoo = candidates.find(c => c.source === 'yahoo');
      return yahoo || candidates[0];
    }

    // Diverge a lot: take average as a conservative estimate
    const avg = (p1 + p2) / 2;
    return new PricePoint(avg, candidates[0].currency || expected, new Date().toISOString());
  }

  async getQuote(ticker, exchange) {
    let y = null, g = null;
    try {
      const q = await this.yahoo.getQuote(ticker, exchange);
      y = new PricePoint(q.price, q.currency, q.asOf); y.source = 'yahoo';
    } catch {}
    try {
      const q = await this.google.getPrice(ticker, exchange === 'JP' ? 'TYO' : undefined);
      g = new PricePoint(q.price, q.currency, q.asOf); g.source = 'google-finance';
    } catch {}

    const best = this._selectBest(ticker, exchange, [y, g]);
    return best;
  }
}

module.exports = CompositeStockProvider;

