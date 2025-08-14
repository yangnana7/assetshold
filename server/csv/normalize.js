const { REQUIRED_HEADERS, ALLOWED_CLASS, isISODate, normalizeMoney, assertEnum } = require('./schema');

function validateHeaders(headers) {
  for (const h of ['class','name','acquired_at','book_value_jpy','liquidity_tier']) {
    if (!headers.includes(h)) throw new Error(`missing header: ${h}`);
  }
}

function validateRow(row) {
  // Strict enum validation for asset class
  assertEnum(row.class, ALLOWED_CLASS);
  
  // Strict name validation
  if (!row.name || row.name.trim().length === 0) {
    throw new Error('name is required and cannot be empty');
  }
  row.name = row.name.trim();
  
  // Strict date validation with range check
  if (row.acquired_at) {
    if (!isISODate(row.acquired_at)) {
      throw new Error('acquired_at must be in YYYY-MM-DD format');
    }
    const date = new Date(row.acquired_at);
    const now = new Date();
    const minDate = new Date('1900-01-01');
    if (date > now || date < minDate) {
      throw new Error('acquired_at must be between 1900-01-01 and today');
    }
  }
  
  // Strict money validation with range check
  try {
    row.book_value_jpy = normalizeMoney(row.book_value_jpy);
  } catch (err) {
    throw new Error(`book_value_jpy invalid: ${err.message}`);
  }
  if (row.book_value_jpy <= 0 || row.book_value_jpy > 1000000000000) {
    throw new Error('book_value_jpy must be > 0 and < 1 trillion yen');
  }
  
  // Strict liquidity tier validation
  if (row.liquidity_tier && !/^L[1-4]$/.test(row.liquidity_tier)) {
    throw new Error('liquidity_tier must be L1, L2, L3, or L4');
  }
  
  // Valuation source validation
  const validValuationSources = ['manual', 'market_api', 'formula'];
  if (row.valuation_source && !validValuationSources.includes(row.valuation_source)) {
    throw new Error(`valuation_source must be one of: ${validValuationSources.join(', ')}`);
  }
  
  // Class-specific validations
  if (row.class === 'us_stock' || row.class === 'jp_stock') {
    if (row.quantity !== undefined && row.quantity !== '') {
      const qty = Number(row.quantity);
      if (!Number.isInteger(qty) || qty <= 0) {
        throw new Error('quantity must be a positive integer for stocks');
      }
    }
  }
  
  if (row.class === 'precious_metal') {
    if (row.weight_g !== undefined && row.weight_g !== '') {
      const weight = Number(row.weight_g);
      if (!Number.isFinite(weight) || weight <= 0) {
        throw new Error('weight_g must be a positive number for precious metals');
      }
    }
  }
  
  // Note can be empty
  if (!row.note) row.note = '';
  
  return row;
}

module.exports = { validateHeaders, validateRow };