import { resolveKeys } from "./resolve";
import { fetchYahoo } from "./providers/yahoo_html";
import { fetchGoogle } from "./providers/google_html";
import { fetchMarketWatch } from "./providers/marketwatch_html";
import { aggregate } from "./aggregate";
import type { ResolveInput } from "./types";

export async function fetchLatestUSQuote(input: ResolveInput, opt?: { providers?: Array<"yahoo"|"google"|"marketwatch"> }) {
  const keys = resolveKeys(input);
  const prov = opt?.providers || ["yahoo","google"];
  const tasks = prov.map(p => p==="yahoo" ? fetchYahoo(keys.yahoo) : p==="google" ? fetchGoogle(keys.google) : fetchMarketWatch(keys.marketwatch));
  const settled = await Promise.allSettled(tasks);
  const ok = settled.filter((s): s is PromiseFulfilledResult<any> => s.status === "fulfilled").map(s=>s.value);
  if (!ok.length) throw new Error("all_providers_failed");
  const agg = aggregate(ok);
  return { keys, quotes: ok, aggregate: agg };
}
