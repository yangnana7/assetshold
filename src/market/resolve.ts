const fs = require('fs');
const path = require('path');

const registryPath = path.resolve(process.cwd(), 'symbol_registry.json');
let REGISTRY = null;

function loadRegistry() {
  if (!REGISTRY) REGISTRY = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
  return REGISTRY;
}

// Normalize ticker symbols: trim, uppercase, remove spaces, normalize dash-like chars to '-'
const normalize = (t) => (
  String(t)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    // Replace a range of unicode dashes (hyphen, en dash, em dash, horizontal bar, minus sign, fullwidth hyphen-minus) with '-'
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\uFF0D]/g, '-')
);

function guessExchange(t, exchange) {
  const x = (exchange || '').toUpperCase();
  if (x) return x;
  return /(AAPL|MSFT|GOOG|GOOGL|META|NVDA)/.test(t) ? 'NASDAQ' : 'NYSE';
}

function resolveKeys(input) {
  const reg = loadRegistry();
  const t0 = normalize(input.ticker);
  const item = reg.tickers.find((x) => [x.canonical, ...(x.aliases || [])].map((s) => normalize(s)).includes(t0));
  const canonical = (item && item.canonical) || t0;
  const exch = (input.exchange || (item && item.exchange) || guessExchange(canonical)).toUpperCase();
  const yahoo = ((item && item.yahoo_key) || canonical).replace(/\./g, '-');
  const google = (item && item.google_key) || `${canonical}:${exch}`;
  // MarketWatch prefers lowercase and '-' instead of '.' in paths
  const marketwatch = (((item && item.marketwatch_key) || canonical)).toLowerCase().replace(/\./g, '-');
  return { canonical, yahoo, google, marketwatch };
}

module.exports = { resolveKeys };

