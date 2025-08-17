import { fetchHtml } from "../fetchHtml";
import type { Quote } from "../types";
export async function fetchYahooCom(key: string, opt?: { html?: string }): Promise<Quote> {
  const url = `https://finance.yahoo.com/quote/${encodeURIComponent(key)}`;
  const html = opt?.html ?? await fetchHtml(url);
  const priceRegexes = [
    /"regularMarketPrice"\s*:\s*\{[^}]*"raw"\s*:\s*([0-9]+\.?[0-9]*)/i,
    /"currentPrice"\s*:\s*\{[^}]*"raw"\s*:\s*([0-9]+\.?[0-9]*)/i,
  ];
  const currencyRegex = /"currency"\s*:\s*"([A-Z]{3})"/i;
  let price: number | null = null;
  for (const rx of priceRegexes) { const m = html.match(rx); if (m) { price = Number(m[1]); break; } }
  if (!isFinite(price as number)) throw new Error("yahoo_com_no_price");
  const cm = html.match(currencyRegex); const currency = cm?.[1] || "USD";
  return { provider: "yahoo", price: Number(price), currency, ts: Date.now(), url, host: "com" };
}
