import { fetchHtml } from "../fetchHtml";
import type { Quote } from "../types";
export async function fetchGoogle(key: string, opt?: { html?: string }): Promise<Quote> {
  const url = `https://www.google.com/finance/quote/${encodeURIComponent(key)}`;
  const html = opt?.html ?? await fetchHtml(url);
  const patterns = [
    /data-last-price\s*=\s*"([0-9]+\.?[0-9]*)"/i,
    /aria-label\s*=\s*"[^"]*\$([0-9]+\.?[0-9]*)[^"]*"/i,
    /\$\s*([0-9]+\.?[0-9]*)/i,
  ];
  let price: number | null = null;
  for (const rx of patterns) { const m = html.match(rx); if (m) { price = Number(m[1]); break; } }
  if (!isFinite(price as number)) throw new Error("google_no_price");
  return { provider: "google", price: Number(price), currency: "USD", ts: Date.now(), url };
}
