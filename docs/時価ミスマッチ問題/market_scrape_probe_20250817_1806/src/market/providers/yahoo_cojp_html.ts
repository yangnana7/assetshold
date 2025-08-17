import { fetchHtml } from "../fetchHtml";
import type { Quote } from "../types";
/** Yahoo Japan は JPY を返す前提（aggregate からは除外される可能性あり） */
export async function fetchYahooJp(key: string, opt?: { html?: string }): Promise<Quote> {
  const url = `https://finance.yahoo.co.jp/quote/${encodeURIComponent(key)}`;
  const html = opt?.html ?? await fetchHtml(url);
  const m = html.match(/>([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?)<\/span>/);
  if (!m) throw new Error("yahoo_jp_no_price");
  const price = Number(m[1].replace(/,/g, ""));
  return { provider: "yahoo", price, currency: "JPY", ts: Date.now(), url, host: "co.jp" };
}
