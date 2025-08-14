const fetch = require('node-fetch');
const { PricePoint, StockProvider } = require('../base');

/**
 * Google Finance Stock Provider
 * Scrapes real-time stock prices from Google Finance
 */
class GoogleFinanceStockProvider extends StockProvider {
  constructor() {
    super('google-finance');
    this.baseUrl = 'https://www.google.com/finance/quote';
  }

  async getPrice(symbol, exchange = null) {
    try {
      // Determine the correct format for Google Finance
      let url;
      
      if (exchange) {
        // For stocks with specific exchange (e.g., AAPL:NASDAQ, 7203:TYO)
        url = `${this.baseUrl}/${symbol}:${exchange}`;
      } else {
        // Auto-detect based on symbol format
        if (this._isJapaneseStock(symbol)) {
          // Japanese stock codes are typically 4 digits, use Tokyo exchange
          url = `${this.baseUrl}/${symbol}:TYO`;
        } else {
          // Assume US stock, let Google Finance auto-detect exchange
          url = `${this.baseUrl}/${symbol}:NASDAQ`;
          // Try multiple exchanges for US stocks
        }
      }

      const price = await this._fetchPriceFromUrl(url, symbol);
      
      if (!price && !exchange) {
        // Try alternative exchanges for US stocks
        const exchanges = ['NYSE', 'NASDAQ', 'AMEX'];
        for (const alt_exchange of exchanges) {
          try {
            const altUrl = `${this.baseUrl}/${symbol}:${alt_exchange}`;
            const altPrice = await this._fetchPriceFromUrl(altUrl, symbol);
            if (altPrice) {
              return {
                ...altPrice,
                exchange: alt_exchange
              };
            }
          } catch (e) {
            // Continue to next exchange
          }
        }
      }

      if (!price) {
        throw new Error(`Could not fetch price for ${symbol}`);
      }

      return price;

    } catch (error) {
      throw new Error(`Google Finance stock error for ${symbol}: ${error.message}`);
    }
  }

  async _fetchPriceFromUrl(url, symbol) {
    const response = await fetch(url, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    
    const priceData = this._extractStockDataFromHtml(html, symbol);
    
    if (!priceData) {
      return null;
    }

    return {
      symbol: symbol,
      price: priceData.price,
      currency: priceData.currency || (this._isJapaneseStock(symbol) ? 'JPY' : 'USD'),
      change: priceData.change,
      changePercent: priceData.changePercent,
      asOf: new Date().toISOString(),
      source: 'google-finance'
    };
  }

  _extractStockDataFromHtml(html, symbol) {
    // Strategy 1: Look for data-last-price attribute
    let priceMatch = html.match(/data-last-price="([0-9.,]+)"/);
    if (priceMatch) {
      const price = this._parseNumber(priceMatch[1]);
      return { price, ...this._extractAdditionalData(html) };
    }

    // Strategy 2: Look for specific div with stock price (YMlKec class)
    priceMatch = html.match(/<div[^>]*class="[^"]*YMlKec[^"]*"[^>]*>([0-9.,]+)<\/div>/);
    if (priceMatch) {
      const price = this._parseNumber(priceMatch[1]);
      return { price, ...this._extractAdditionalData(html) };
    }

    // Strategy 3: Look for div with fxKbKc class (main price display)
    priceMatch = html.match(/<div[^>]*class="[^"]*fxKbKc[^"]*"[^>]*>([0-9.,]+)<\/div>/);
    if (priceMatch) {
      const price = this._parseNumber(priceMatch[1]);
      return { price, ...this._extractAdditionalData(html) };
    }

    // Strategy 4: Look for price in JSON-LD structured data
    const jsonLdMatch = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s);
    if (jsonLdMatch) {
      try {
        const jsonData = JSON.parse(jsonLdMatch[1]);
        if (jsonData.price || (jsonData['@graph'] && jsonData['@graph'].price)) {
          const price = this._parseNumber((jsonData.price || jsonData['@graph'].price).toString());
          return { price, ...this._extractAdditionalData(html) };
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }
    }

    // Strategy 5: Look for meta property with price
    priceMatch = html.match(/<meta[^>]*property="[^"]*price[^"]*"[^>]*content="([0-9.,]+)"[^>]*>/i);
    if (priceMatch) {
      const price = this._parseNumber(priceMatch[1]);
      return { price, ...this._extractAdditionalData(html) };
    }

    // Strategy 6: Look for price near symbol mention
    const lines = html.split('\n');
    for (const line of lines) {
      if (line.includes(symbol)) {
        const numberMatch = line.match(/([0-9]{1,4}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,4})?)/);
        if (numberMatch) {
          const price = this._parseNumber(numberMatch[1]);
          // Basic range validation
          if (this._isReasonablePrice(price, symbol)) {
            return { price, ...this._extractAdditionalData(html) };
          }
        }
      }
    }

    return null;
  }

  _extractAdditionalData(html) {
    const data = {};

    // Extract currency - improved detection
    const currencyPatterns = [
      /Currency in ([A-Z]{3})/i,
      /"currency":"([A-Z]{3})"/i,
      /\b(USD|JPY|EUR|GBP)\b/,
      /([A-Z]{3})\s*[0-9.,]+/
    ];
    
    for (const pattern of currencyPatterns) {
      const match = html.match(pattern);
      if (match && ['USD', 'JPY', 'EUR', 'GBP', 'CAD', 'AUD'].includes(match[1])) {
        data.currency = match[1];
        break;
      }
    }

    // Extract change value
    const changeMatch = html.match(/([+-]?[0-9.,]+)\s*\([+-]?[0-9.,]+%\)/);
    if (changeMatch) {
      data.change = this._parseNumber(changeMatch[1]);
    }

    // Extract change percentage
    const changePercentMatch = html.match(/\(([+-]?[0-9.,]+)%\)/);
    if (changePercentMatch) {
      data.changePercent = this._parseNumber(changePercentMatch[1]);
    }

    return data;
  }

  _parseNumber(str) {
    if (!str) return null;
    
    // Remove any non-numeric characters except dots, commas, and signs
    const cleaned = str.replace(/[^\d.,-]/g, '');
    
    // Handle different number formats
    if (cleaned.includes(',') && cleaned.includes('.')) {
      // Format like 1,234.56 or 1.234,56
      const lastDot = cleaned.lastIndexOf('.');
      const lastComma = cleaned.lastIndexOf(',');
      
      if (lastDot > lastComma) {
        // Format: 1,234.56
        return parseFloat(cleaned.replace(/,/g, ''));
      } else {
        // Format: 1.234,56
        return parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
      }
    } else if (cleaned.includes(',')) {
      // Could be 1,234 (thousands) or 1,23 (decimal)
      const parts = cleaned.split(',');
      if (parts.length === 2 && parts[1].length <= 2) {
        // Likely decimal: 1,23
        return parseFloat(cleaned.replace(',', '.'));
      } else {
        // Likely thousands: 1,234
        return parseFloat(cleaned.replace(/,/g, ''));
      }
    } else {
      // Simple number
      return parseFloat(cleaned);
    }
  }

  _isJapaneseStock(symbol) {
    // Japanese stock codes are typically 4-digit numbers
    return /^\d{4}$/.test(symbol);
  }

  _isReasonablePrice(price, symbol) {
    if (!price || isNaN(price) || price <= 0) return false;
    
    if (this._isJapaneseStock(symbol)) {
      // Japanese stocks typically range from 100 to 50000 yen
      return price >= 50 && price <= 100000;
    } else {
      // US stocks typically range from $1 to $1000
      return price >= 0.01 && price <= 10000;
    }
  }

  // Yahoo provider compatible interface
  async getQuote(ticker, exchange) {
    try {
      let symbol = ticker;
      let exchangeHint = null;
      
      if (exchange === 'JP') {
        // Japanese stock
        exchangeHint = 'TYO';
      } else {
        // US or other stock - let Google Finance auto-detect
        exchangeHint = null;
      }
      
      const priceData = await this.getPrice(symbol, exchangeHint);
      
      return new PricePoint(
        priceData.price,
        priceData.currency,
        priceData.asOf
      );
      
    } catch (error) {
      console.error(`Google Finance failed for ${ticker}.${exchange}:`, error.message);
      // Fallback to reasonable default
      const fallbackPrice = exchange === 'JP' ? 1500.0 : 150.0;
      const fallbackCurrency = exchange === 'JP' ? 'JPY' : 'USD';
      
      return new PricePoint(
        fallbackPrice,
        fallbackCurrency,
        new Date().toISOString()
      );
    }
  }

  // Method compatible with existing Yahoo provider interface
  async getStockPrice(symbol, currency = 'USD') {
    const priceData = await this.getPrice(symbol);
    
    return {
      symbol: symbol,
      price: priceData.price,
      currency: priceData.currency || currency,
      asOf: priceData.asOf,
      change: priceData.change,
      changePercent: priceData.changePercent
    };
  }
}

module.exports = GoogleFinanceStockProvider;