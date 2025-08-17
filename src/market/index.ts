const { resolveKeys } = require('./resolve.ts');
const { fetchYahoo } = require('./providers/yahoo_html.ts');
const { fetchGoogle } = require('./providers/google_html.ts');
const { fetchMarketWatch } = require('./providers/marketwatch_html.ts');
const { aggregate } = require('./aggregate.ts');

async function fetchLatestUSQuote(input, opt) {
  const keys = resolveKeys(input);
  const prov = (opt && opt.providers) || ["yahoo","google"];
  const tasks = prov.map(p => p==="yahoo" ? fetchYahoo(keys.yahoo) : p==="google" ? fetchGoogle(keys.google) : fetchMarketWatch(keys.marketwatch));
  const settled = await Promise.allSettled(tasks);
  const ok = settled.filter(s => s.status === "fulfilled").map(s=>s.value);
  if (!ok.length) throw new Error("all_providers_failed");
  const agg = aggregate(ok);
  return { keys, quotes: ok, aggregate: agg };
}

module.exports = { fetchLatestUSQuote };