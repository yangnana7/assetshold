/**
 * Book Value Recalculation Service
 * Handles recalculation of book values when quantities/weights change
 */

const { intYenFloorFrom2Decimals } = require('../utils/number');

function floor2(x) { return intYenFloorFrom2Decimals(x); }

/**
 * Recalculate book value based on strategy
 * @param {Object} db - Database connection
 * @param {number} assetId - Asset ID
 * @param {Object} options - Options object
 * @param {string} options.class - Asset class (us_stock, jp_stock, precious_metal)
 * @param {string} options.recalc - Recalculation strategy (auto, scale, unit)
 * @param {number} options.newQuantity - New quantity (for stocks)
 * @param {number} options.newWeight - New weight (for precious metals)
 * @param {number} options.avgPriceUsd - Average price USD (optional)
 * @param {number} options.avgPriceJpy - Average price JPY (optional)
 * @param {number} options.unitBookCostJpyPerGram - Unit book cost per gram (optional)
 * @returns {Promise<number>} - New book value in JPY
 */
async function recalcBookValue(db, assetId, options) {
  const { class: assetClass, recalc, newQuantity, newWeight, avgPriceUsd, avgPriceJpy, unitBookCostJpyPerGram } = options;

  return new Promise((resolve, reject) => {
    // Get current asset and class-specific data
    const assetQuery = 'SELECT * FROM assets WHERE id = ?';
    
    db.get(assetQuery, [assetId], (err, asset) => {
      if (err) return reject(err);
      if (!asset) return reject(new Error('Asset not found'));

      if (assetClass === 'us_stock') {
        handleUsStock(db, asset, options, resolve, reject);
      } else if (assetClass === 'jp_stock') {
        handleJpStock(db, asset, options, resolve, reject);
      } else if (assetClass === 'precious_metal') {
        handlePreciousMetal(db, asset, options, resolve, reject);
      } else {
        reject(new Error('Unsupported asset class'));
      }
    });
  });
}

function handleUsStock(db, asset, options, resolve, reject) {
  const { recalc, newQuantity, avgPriceUsd } = options;
  
  db.get('SELECT * FROM us_stocks WHERE asset_id = ?', [asset.id], (err, stockData) => {
    if (err) return reject(err);
    if (!stockData) return reject(new Error('US stock data not found'));

    const oldQuantity = stockData.quantity;

    if (recalc === 'unit' || (recalc === 'auto' && Number.isFinite(avgPriceUsd))) {
      // Unit method: use provided unit price
      if (!Number.isFinite(avgPriceUsd) || avgPriceUsd <= 0) {
        return reject(new Error('Valid avg_price_usd required for unit calculation'));
      }
      
      // For now, use scale method as fallback since we don't have acquisition FX rate
      // TODO: Implement proper unit calculation with acquisition_fx_usdjpy
      if (oldQuantity <= 0) {
        return reject(new Error('need_unit_price'));
      }
      
      const unitBook = Number(asset.book_value_jpy) / oldQuantity;
      const newBook = floor2(unitBook * newQuantity);
      resolve(newBook);
    } else {
      // Scale method: proportional scaling
      if (oldQuantity <= 0) {
        return reject(new Error('need_unit_price'));
      }
      
      const unitBook = Number(asset.book_value_jpy) / oldQuantity;
      const newBook = floor2(unitBook * newQuantity);
      resolve(newBook);
    }
  });
}

function handleJpStock(db, asset, options, resolve, reject) {
  const { recalc, newQuantity, avgPriceJpy } = options;
  
  db.get('SELECT * FROM jp_stocks WHERE asset_id = ?', [asset.id], (err, stockData) => {
    if (err) return reject(err);
    if (!stockData) return reject(new Error('JP stock data not found'));

    const oldQuantity = stockData.quantity;

    if (recalc === 'unit' || (recalc === 'auto' && Number.isFinite(avgPriceJpy))) {
      // Unit method: use provided unit price
      if (!Number.isFinite(avgPriceJpy) || avgPriceJpy <= 0) {
        return reject(new Error('Valid avg_price_jpy required for unit calculation'));
      }
      
      const newBook = floor2(avgPriceJpy * newQuantity);
      resolve(newBook);
    } else {
      // Scale method: proportional scaling
      if (oldQuantity <= 0) {
        return reject(new Error('need_unit_price'));
      }
      
      const unitBook = Number(asset.book_value_jpy) / oldQuantity;
      const newBook = floor2(unitBook * newQuantity);
      resolve(newBook);
    }
  });
}

function handlePreciousMetal(db, asset, options, resolve, reject) {
  const { recalc, newWeight, unitBookCostJpyPerGram } = options;
  
  db.get('SELECT * FROM precious_metals WHERE asset_id = ?', [asset.id], (err, metalData) => {
    if (err) return reject(err);
    if (!metalData) return reject(new Error('Precious metal data not found'));

    const oldWeight = metalData.weight_g;

    if (recalc === 'unit' || (recalc === 'auto' && Number.isFinite(unitBookCostJpyPerGram))) {
      // Unit method: use provided unit cost per gram
      if (!Number.isFinite(unitBookCostJpyPerGram) || unitBookCostJpyPerGram <= 0) {
        return reject(new Error('Valid unit_book_cost_jpy_per_gram required for unit calculation'));
      }
      
      const newBook = floor2(unitBookCostJpyPerGram * newWeight);
      resolve(newBook);
    } else {
      // Scale method: proportional scaling
      if (oldWeight <= 0) {
        return reject(new Error('need_unit_price'));
      }
      
      const unitBook = Number(asset.book_value_jpy) / oldWeight;
      const newBook = floor2(unitBook * newWeight);
      resolve(newBook);
    }
  });
}

module.exports = {
  recalcBookValue,
  floor2
};
