// Tanaka Kikinzoku provider for precious metals market data
const { PricePoint, StockProvider } = require('./base');

class TanakaPreciousMetalProvider extends StockProvider {
  constructor() {
    super('tanaka');
  }

  async getQuote(metal, exchange) {
    try {
      // Use real Tanaka implementation for gold
      if (metal.toLowerCase() === 'gold') {
        try {
          const { getGoldJPYPerGram } = require('./metal/TanakaProvider');
          const goldData = await getGoldJPYPerGram();
          return new PricePoint(
            goldData.price_jpy_per_g,
            'JPY',
            goldData.as_of
          );
        } catch (fetchError) {
          console.error('Tanaka real data fetch failed:', fetchError.message);
          // Fall back to Mitsubishi Materials public price
          try {
            const { getMitsubishiJPYPerGram } = require('./metal/MitsubishiProvider');
            const mm = await getMitsubishiJPYPerGram('gold');
            return new PricePoint(mm.price_jpy_per_g, 'JPY', mm.as_of);
          } catch (mmError) {
            console.error('Mitsubishi fallback failed:', mmError.message);
            throw mmError;
          }
        }
      }
      
      // For other metals, try Mitsubishi first
      try {
        const { getMitsubishiJPYPerGram } = require('./metal/MitsubishiProvider');
        const mm = await getMitsubishiJPYPerGram(metal);
        return new PricePoint(mm.price_jpy_per_g, 'JPY', mm.as_of);
      } catch (mmError) {
        console.error('Mitsubishi metal fetch failed:', mmError.message);
        throw mmError;
      }
    } catch (error) {
      throw new Error(`Tanaka Precious Metal API failed: ${error.message}`);
    }
  }

  _getTanakaPriceData(metal) { return { price: NaN, currency: 'JPY' }; }

  async fetchLiveData() {
    // Future implementation for live data fetching
    // This would use web scraping or API to get real-time prices
    throw new Error('Live data fetching not implemented yet');
  }
}

module.exports = {
  TanakaPreciousMetalProvider
};
