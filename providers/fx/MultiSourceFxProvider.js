const GoogleFinanceFxProvider = require('./GoogleFinanceFxProvider');

/**
 * Multi-Source FX Provider
 * Aggregates rates from multiple real-time sources for accuracy
 */
class MultiSourceFxProvider {
  constructor() {
    this.name = 'multi-source-realtime';
    this.sources = [
      new GoogleFinanceFxProvider()
    ];
  }

  async getRate(pair = 'USDJPY') {
    const rates = [];
    const errors = [];

    // Try all sources
    for (const source of this.sources) {
      try {
        const rate = await source.getRate(pair);
        if (rate && rate.price && !isNaN(rate.price)) {
          rates.push({
            ...rate,
            source: source.name
          });
        }
      } catch (error) {
        errors.push(`${source.name}: ${error.message}`);
      }
    }

    if (rates.length === 0) {
      throw new Error(`All sources failed: ${errors.join('; ')}`);
    }

    // If multiple rates, use the median or most recent
    if (rates.length === 1) {
      return rates[0];
    }

    // Calculate median for better accuracy
    const prices = rates.map(r => r.price).sort((a, b) => a - b);
    const medianPrice = prices[Math.floor(prices.length / 2)];

    // Find the rate closest to median
    const bestRate = rates.reduce((prev, curr) => 
      Math.abs(curr.price - medianPrice) < Math.abs(prev.price - medianPrice) ? curr : prev
    );

    return {
      ...bestRate,
      price: parseFloat(medianPrice.toFixed(4)),
      sources: rates.map(r => ({ source: r.source, price: r.price })),
      asOf: new Date().toISOString()
    };
  }

  // Add more real-time sources
  async addXeComSource() {
    // XE.com scraper could be added here
  }

  async addYahooFinanceSource() {
    // Alternative Yahoo Finance endpoint could be added here
  }
}

module.exports = MultiSourceFxProvider;