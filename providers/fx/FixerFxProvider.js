const fetch = require('node-fetch');

/**
 * Fixer.io FX Provider
 * Uses fixer.io API (free tier: 100 requests/month)
 */
class FixerFxProvider {
  constructor() {
    this.name = 'fixer';
    this.baseUrl = 'https://api.fixer.io/latest';
  }

  async getRate(pair = 'USDJPY') {
    try {
      const pairUpper = pair.toUpperCase();
      
      if (pairUpper === 'USDJPY') {
        // Get rates with USD as base
        const response = await fetch(`${this.baseUrl}?base=USD&symbols=JPY`, {
          timeout: 10000,
          headers: { 'User-Agent': 'assetshold/1.0' }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.rates || !data.rates.JPY) {
          throw new Error('No JPY rate in response');
        }
        
        return {
          price: data.rates.JPY,
          currency: 'JPY',
          asOf: new Date(data.date + 'T00:00:00Z').toISOString()
        };
        
      } else if (pairUpper === 'CNYJPY') {
        // Get rates with CNY as base
        const response = await fetch(`${this.baseUrl}?base=CNY&symbols=JPY`, {
          timeout: 10000,
          headers: { 'User-Agent': 'assetshold/1.0' }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.rates || !data.rates.JPY) {
          throw new Error('No JPY rate in response');
        }
        
        return {
          price: data.rates.JPY,
          currency: 'JPY',
          asOf: new Date(data.date + 'T00:00:00Z').toISOString()
        };
        
      } else {
        throw new Error(`Unsupported pair: ${pair}`);
      }
      
    } catch (error) {
      throw new Error(`Fixer FX API error: ${error.message}`);
    }
  }
}

module.exports = FixerFxProvider;