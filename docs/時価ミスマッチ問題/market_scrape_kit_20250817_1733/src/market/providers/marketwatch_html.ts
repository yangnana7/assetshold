import { fetchHtml } from "../fetchHtml";
import type { Quote } from "../types";
export async function fetchMarketWatch(key: string, opt?: { html?: string }): Promise<Quote> {
  const url = `https://www.marketwatch.com/investing/stock/${encodeURIComponent(key.replace(/\./g,'-').toLowerCase())}`;
  const html = opt?.html ?? await fetchHtml(url);
  const patterns = [
    /"price"\s*:\s*\{[^}]*"last"\s*:\s*([0-9]+\.?[0-9]*)/i,
    /<bg-quote[^>]*class="value"[^>]*>([0-9]+\.?[0-9]*)<\/bg-quote>/i,
  ];
  let price: number | null = null;
  for (const rx of patterns) { const m = html.match(rx); if (m) { price = Number(m[1]); break; } }
  if (!isFinite(price as number)) throw new Error("marketwatch_no_price");
  return { provider: "marketwatch", price: Number(price), currency: "USD", ts: Date.now(), url };
}
