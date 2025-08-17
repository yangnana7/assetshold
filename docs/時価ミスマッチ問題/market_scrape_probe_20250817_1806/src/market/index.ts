import { resolveKeys } from "./resolve";
import { fetchYahooCom } from "./providers/yahoo_com_html";
import { fetchYahooJp } from "./providers/yahoo_cojp_html";
import { fetchGoogle } from "./providers/google_html";
import { fetchMarketWatch } from "./providers/marketwatch_html";
import { aggregate } from "./aggregate";
import type { ResolveInput } from "./types";

export async function fetchLatestUSQuote(input: ResolveInput, opt?: { providers?: Array<"yahoo"|"google"|"marketwatch">; yahooHost?: "com"|"co.jp" }) {
  const keys = resolveKeys(input);
  const providers = opt?.providers || ["yahoo","google"];
  const yahooHost = opt?.yahooHost || "com";
  const tasks = providers.map(p => {
    if (p === "yahoo") return yahooHost === "co.jp" ? fetchYahooJp(keys.yahoo) : fetchYahooCom(keys.yahoo);
    if (p === "google") return fetchGoogle(keys.google);
    return fetchMarketWatch(keys.marketwatch);
  });
  const settled = await Promise.allSettled(tasks);
  const ok = settled.filter((s): s is PromiseFulfilledResult<any> => s.status === "fulfilled").map(s=>s.value);
  const ng = settled.filter((s): s is PromiseRejectedResult => s.status === "rejected").map(s=>({ error: String(s.reason) }));
  if (!ok.length) throw new Error("all_providers_failed");
  const agg = aggregate(ok);
  return { keys, quotes: ok, aggregate: agg, errors: ng };
}
