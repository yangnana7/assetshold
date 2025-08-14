const fetch = require('node-fetch');

/**
 * OANDA-style FX Provider
 * Uses alternative free APIs that provide OANDA-quality data
 * 
 * Note: OANDA v20 API requires authentication and paid subscription
 * This provider uses free alternatives with OANDA-quality precision
 */
class OandaFxProvider {
  constructor() {
    this.name = 'oanda-style';
    
    // Try multiple free APIs for redundancy
    this.endpoints = [
      {
        name: 'open-exchange-rates-api',
        url: 'https://open.er-api.com/v6/latest',
        getRateUrl: (base) => `https://open.er-api.com/v6/latest/${base}`
      },
      {
        name: 'exchangerate-api',
        url: 'https://api.exchangerate-api.com/v4/latest',
        getRateUrl: (base) => `https://api.exchangerate-api.com/v4/latest/${base}`
      }
    ];
  }

  async getRate(pair = 'USDJPY') {
    const pairUpper = pair.toUpperCase();
    
    for (const endpoint of this.endpoints) {
      try {
        if (pairUpper === 'USDJPY') {
          return await this._getUSDJPYRate(endpoint);
        } else if (pairUpper === 'CNYJPY') {
          return await this._getCNYJPYRate(endpoint);
        } else {
          throw new Error(`Unsupported pair: ${pair}`);
        }
      } catch (error) {
        console.log(`${endpoint.name} failed: ${error.message}, trying next endpoint...`);
        continue;
      }
    }
    
    throw new Error('All OANDA-style endpoints failed');
  }

  async _getUSDJPYRate(endpoint) {
    const url = endpoint.getRateUrl ? endpoint.getRateUrl('USD') : `${endpoint.url}/USD`;
    
    const response = await fetch(url, {
      timeout: 10000,
      headers: { 
        'User-Agent': 'assetshold/1.0 (OANDA-style client)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.rates || !data.rates.JPY) {
      throw new Error('No JPY rate in response');
    }
    
    // Return in OANDA-compatible format with high precision
    return {
      price: parseFloat(data.rates.JPY.toFixed(4)), // OANDA-style precision
      currency: 'JPY',
      asOf: data.date ? new Date(data.date + 'T00:00:00Z').toISOString() : new Date().toISOString(),
      provider: endpoint.name
    };
  }

  async _getCNYJPYRate(endpoint) {
    const url = endpoint.getRateUrl ? endpoint.getRateUrl('USD') : `${endpoint.url}/USD`;
    
    const response = await fetch(url, {
      timeout: 10000,
      headers: { 
        'User-Agent': 'assetshold/1.0 (OANDA-style client)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    if (!data.rates || !data.rates.JPY || !data.rates.CNY) {
      throw new Error('Missing JPY or CNY rates in response');
    }
    
    // Calculate CNY to JPY: (1 USD / CNY rate) * JPY rate
    const cnyToJpy = data.rates.JPY / data.rates.CNY;
    
    return {
      price: parseFloat(cnyToJpy.toFixed(4)), // OANDA-style precision
      currency: 'JPY',
      asOf: data.date ? new Date(data.date + 'T00:00:00Z').toISOString() : new Date().toISOString(),
      provider: endpoint.name
    };
  }

  // OANDA-style rate information method
  async getRateInfo(pair = 'USDJPY') {
    const rate = await this.getRate(pair);
    
    return {
      instrument: pair,
      time: rate.asOf,
      bid: rate.price - 0.01, // Simulated bid/ask spread
      ask: rate.price + 0.01,
      mid: rate.price,
      provider: rate.provider || this.name
    };
  }
}

module.exports = OandaFxProvider;