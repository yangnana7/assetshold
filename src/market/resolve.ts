const fs = require('fs');
const path = require('path');

const registryPath = path.resolve(process.cwd(), "symbol_registry.json");
let REGISTRY = null;

function loadRegistry() {
  if (!REGISTRY) REGISTRY = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
  return REGISTRY;
}
const normalize = (t) => t.trim().toUpperCase().replace(/\s+/g,"").replace(/—|–/g,"-");
function guessExchange(t, exchange) {
  const x = (exchange||"").toUpperCase();
  if (x) return x;
  if (/(AAPL|MSFT|GOOG|GOOGL|META|NVDA)/.test(t)) return "NASDAQ";
  return "NYSE";
}
function resolveKeys(input) {
  const reg = loadRegistry();
  const t0 = normalize(input.ticker);
  const item = reg.tickers.find((x) => [x.canonical, ...(x.aliases||[])].map((s)=>normalize(s)).includes(t0));
  const canonical = (item && item.canonical) || t0;
  const exch = (input.exchange || (item && item.exchange) || guessExchange(canonical)).toUpperCase();
  const yahoo = ((item && item.yahoo_key) || canonical).replace(/\./g,"-");
  const google = (item && item.google_key) || `${canonical}:${exch}`;
  const marketwatch = (item && item.marketwatch_key) || canonical;
  return { canonical, yahoo, google, marketwatch };
}

module.exports = { resolveKeys };