const fetch = require('node-fetch');

/**
 * Google Finance FX Provider
 * Scrapes real-time exchange rates from Google Finance
 */
class GoogleFinanceFxProvider {
  constructor() {
    this.name = 'google-finance';
    this.baseUrl = 'https://www.google.com/finance/quote';
  }

  async getRate(pair = 'USDJPY') {
    try {
      const pairUpper = pair.toUpperCase();
      
      if (pairUpper === 'USDJPY') {
        return await this._getGoogleRate('USD', 'JPY');
      } else if (pairUpper === 'CNYJPY') {
        return await this._getGoogleRate('CNY', 'JPY');
      } else {
        throw new Error(`Unsupported pair: ${pair}`);
      }
    } catch (error) {
      throw new Error(`Google Finance error: ${error.message}`);
    }
  }

  async _getGoogleRate(fromCurrency, toCurrency) {
    const url = `${this.baseUrl}/${fromCurrency}-${toCurrency}`;
    
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
    
    // Multiple strategies to extract the rate from Google Finance HTML
    const rate = this._extractRateFromHtml(html, fromCurrency, toCurrency);
    
    if (!rate) {
      throw new Error('Could not extract rate from Google Finance page');
    }

    return {
      price: parseFloat(rate),
      currency: toCurrency,
      asOf: new Date().toISOString(),
      source: 'google-finance'
    };
  }

  _extractRateFromHtml(html, fromCurrency, toCurrency) {
    // Strategy 1: Look for data-last-price attribute
    let match = html.match(/data-last-price="([0-9.,]+)"/);
    if (match) {
      return this._parseNumber(match[1]);
    }

    // Strategy 2: Look for specific div with exchange rate
    match = html.match(/<div[^>]*class="[^"]*YMlKec[^"]*"[^>]*>([0-9.,]+)<\/div>/);
    if (match) {
      return this._parseNumber(match[1]);
    }

    // Strategy 3: Look for div with fxKbKc class (Google Finance rate display)
    match = html.match(/<div[^>]*class="[^"]*fxKbKc[^"]*"[^>]*>([0-9.,]+)<\/div>/);
    if (match) {
      return this._parseNumber(match[1]);
    }

    // Strategy 4: Look for data-value attribute
    match = html.match(/data-value="([0-9.,]+)"/);
    if (match) {
      return this._parseNumber(match[1]);
    }

    // Strategy 5: Look for JSON-LD structured data
    const jsonLdMatch = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s);
    if (jsonLdMatch) {
      try {
        const jsonData = JSON.parse(jsonLdMatch[1]);
        if (jsonData.price || jsonData['@graph']?.price) {
          const price = jsonData.price || jsonData['@graph']?.price;
          return this._parseNumber(price.toString());
        }
      } catch (e) {
        // Ignore JSON parsing errors
      }
    }

    // Strategy 6: Look for specific pattern with currency codes
    const currencyPattern = new RegExp(`${fromCurrency}\\s*[\\/-]\\s*${toCurrency}[^0-9]*([0-9.,]+)`, 'i');
    match = html.match(currencyPattern);
    if (match) {
      return this._parseNumber(match[1]);
    }

    // Strategy 7: Look for meta property with price
    match = html.match(/<meta[^>]*property="[^"]*price[^"]*"[^>]*content="([0-9.,]+)"[^>]*>/i);
    if (match) {
      return this._parseNumber(match[1]);
    }

    // Strategy 8: Generic number pattern near currency mention
    const lines = html.split('\n');
    for (const line of lines) {
      if (line.includes(fromCurrency) && line.includes(toCurrency)) {
        const numberMatch = line.match(/([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,4})?)/);
        if (numberMatch) {
          const num = this._parseNumber(numberMatch[1]);
          // Reasonable range check for USD/JPY (typically 100-200)
          if (fromCurrency === 'USD' && toCurrency === 'JPY' && num >= 100 && num <= 200) {
            return num;
          }
          // Reasonable range check for CNY/JPY (typically 15-30)
          if (fromCurrency === 'CNY' && toCurrency === 'JPY' && num >= 15 && num <= 30) {
            return num;
          }
        }
      }
    }

    return null;
  }

  _parseNumber(str) {
    if (!str) return null;
    
    // Remove any non-numeric characters except dots and commas
    const cleaned = str.replace(/[^\d.,]/g, '');
    
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
}

module.exports = GoogleFinanceFxProvider;