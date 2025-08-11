// Yahoo Finance provider for market data (BDD requirement 4.3)

const { PricePoint, StockProvider, FxProvider } = require('./base');

class YahooStockProvider extends StockProvider {
  constructor() {
    super('yahoo');
  }

  async getQuote(ticker, exchange) {
    try {
      // Mock implementation - in production, use yahoo-finance2 or similar
      const mockData = this._getMockStockData(ticker, exchange);
      
      return new PricePoint(
        mockData.price,
        mockData.currency,
        new Date().toISOString()
      );
    } catch (error) {
      throw new Error(`Yahoo Stock API failed: ${error.message}`);
    }
  }

  _getMockStockData(ticker, exchange) {
    // Mock stock prices for development/testing
    const mockPrices = {
      'AAPL': { price: 185.50, currency: 'USD' },
      'GOOGL': { price: 142.75, currency: 'USD' },
      'MSFT': { price: 415.25, currency: 'USD' },
      '7203': { price: 2450, currency: 'JPY' }, // Toyota
      '7974': { price: 8920, currency: 'JPY' }, // Nintendo
      '6758': { price: 1285, currency: 'JPY' }  // Sony
    };

    return mockPrices[ticker] || { price: 100.0, currency: 'USD' };
  }
}

class YahooFxProvider extends FxProvider {
  constructor() {
    super('yahoo');
  }

  async getRate(pair) {
    try {
      // Mock implementation - in production, use currency API
      const mockRate = this._getMockFxRate(pair);
      
      return new PricePoint(
        mockRate,
        'JPY',
        new Date().toISOString()
      );
    } catch (error) {
      throw new Error(`Yahoo FX API failed: ${error.message}`);
    }
  }

  _getMockFxRate(pair) {
    // Mock exchange rates for development/testing
    const mockRates = {
      'USDJPY': 149.25,
      'CNYJPY': 20.85
    };

    return mockRates[pair] || 149.25;
  }
}

module.exports = {
  YahooStockProvider,
  YahooFxProvider
};