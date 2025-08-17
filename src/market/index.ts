const { resolveKeys } = require('./resolve.ts');
const { fetchYahooCom } = require('./providers/yahoo_com_html.ts');
const { fetchYahooJp } = require('./providers/yahoo_cojp_html.ts');
const { fetchGoogle } = require('./providers/google_html.ts');
const { fetchMarketWatch } = require('./providers/marketwatch_html.ts');
const { aggregate } = require('./aggregate.ts');

async function fetchLatestUSQuote(input, opt) {
  const keys = resolveKeys(input);
  const providers = (opt && opt.providers) || ["yahoo","google"];
  const yahooHost = (opt && opt.yahooHost) || "com";
  const tasks = providers.map(p => {
    if (p === "yahoo") return yahooHost === "co.jp" ? fetchYahooJp(keys.yahoo) : fetchYahooCom(keys.yahoo);
    if (p === "google") return fetchGoogle(keys.google, opt && opt.googleUrlOverride ? { urlOverride: opt.googleUrlOverride } : undefined);
    return fetchMarketWatch(keys.marketwatch);
  });
  const settled = await Promise.allSettled(tasks);
  const ok = settled.filter(s => s.status === "fulfilled").map(s=>s.value);
  const ng = settled.filter(s => s.status === "rejected").map(s=>({ error: String(s.reason) }));
  if (!ok.length) throw new Error("all_providers_failed");
  const agg = aggregate(ok);
  return { keys, quotes: ok, aggregate: agg, errors: ng };
}

module.exports = { fetchLatestUSQuote };
