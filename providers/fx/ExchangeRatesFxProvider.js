const fetch = require('node-fetch');

/**
 * Exchange Rates API FX Provider
 * Uses exchangerate-api.com (free tier available)
 */
class ExchangeRatesFxProvider {
  constructor() {
    this.name = 'exchangerate-api';
    this.baseUrl = 'https://api.exchangerate-api.com/v4/latest';
  }

  async getRate(pair = 'USDJPY') {
    try {
      const pairUpper = pair.toUpperCase();
      
      if (pairUpper === 'USDJPY') {
        // Get USD to JPY rate
        const response = await fetch(`${this.baseUrl}/USD`, {
          timeout: 10000,
          headers: { 'User-Agent': 'assetshold/1.0' }
        });
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.rates || !data.rates.JPY) {
          throw new Error('No JPY rate in response');
        }
        
        return {
          price: data.rates.JPY,
          currency: 'JPY',
          asOf: new Date(data.date + 'T00:00:00Z').toISOString()
        };
        
      } else if (pairUpper === 'CNYJPY') {
        // Get CNY to JPY rate via USD
        const usdResponse = await fetch(`${this.baseUrl}/USD`, {
          timeout: 10000,
          headers: { 'User-Agent': 'assetshold/1.0' }
        });
        
        if (!usdResponse.ok) {
          throw new Error(`HTTP ${usdResponse.status}: ${usdResponse.statusText}`);
        }
        
        const usdData = await usdResponse.json();
        
        if (!usdData.rates || !usdData.rates.JPY || !usdData.rates.CNY) {
          throw new Error('Missing JPY or CNY rates in USD response');
        }
        
        // Calculate CNY to JPY: (1 USD / CNY rate) * JPY rate
        const cnyToJpy = usdData.rates.JPY / usdData.rates.CNY;
        
        return {
          price: cnyToJpy,
          currency: 'JPY',
          asOf: new Date(usdData.date + 'T00:00:00Z').toISOString()
        };
        
      } else {
        throw new Error(`Unsupported pair: ${pair}`);
      }
      
    } catch (error) {
      throw new Error(`ExchangeRates FX API error: ${error.message}`);
    }
  }
}

module.exports = ExchangeRatesFxProvider;