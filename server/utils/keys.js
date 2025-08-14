// Cache key helpers to avoid string duplication

function fxKey(pair) {
  return `fx:${pair}`; // e.g., fx:USDJPY
}

function stockKey(exchange, symbol) {
  return `stock:${exchange}:${symbol}`; // e.g., stock:US:AAPL or stock:JP:7203
}

function metalKey(metal) {
  return `precious_metal:${metal}`; // e.g., precious_metal:gold
}

module.exports = { fxKey, stockKey, metalKey };

