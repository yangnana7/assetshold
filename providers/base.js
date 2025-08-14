// Base provider classes for market data fetching (BDD requirement 4.3)

class PricePoint {
  constructor(price, currency, asOf) {
    this.price = price;
    this.currency = currency;
    this.asOf = asOf; // ISO8601 string
  }
}

class StockProvider {
  constructor(name) {
    this.name = name;
  }

  async getQuote(ticker, exchange) {
    throw new Error('StockProvider.getQuote must be implemented');
  }
}

class FxProvider {
  constructor(name) {
    this.name = name;
  }

  async getRate(pair) {
    if (!['USDJPY', 'CNYJPY'].includes(pair)) {
      throw new Error(`Unsupported currency pair: ${pair}`);
    }
    throw new Error('FxProvider.getRate must be implemented');
  }
}

// Noop provider for offline mode
class NoopProvider extends StockProvider {
  constructor() {
    super('noop');
  }

  async getQuote(ticker, exchange) {
    throw new MarketDisabledError('Market data is disabled (MARKET_ENABLE=0)');
  }
}

class NoopFxProvider extends FxProvider {
  constructor() {
    super('noop');
  }

  async getRate(pair) {
    throw new MarketDisabledError('Market data is disabled (MARKET_ENABLE=0)');
  }
}

class UpstreamUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UpstreamUnavailableError';
  }
}

class MarketDisabledError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MarketDisabledError';
  }
}

module.exports = {
  PricePoint,
  StockProvider,
  FxProvider,
  NoopProvider,
  NoopFxProvider,
  UpstreamUnavailableError,
  MarketDisabledError
};
