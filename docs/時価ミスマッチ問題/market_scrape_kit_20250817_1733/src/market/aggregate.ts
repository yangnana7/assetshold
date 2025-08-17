import type { Quote, AggregateResult } from "./types";
export function aggregate(quotes: Quote[], opts?: { maxDev?: number }): AggregateResult {
  const { maxDev = 0.01 } = opts || {};
  const usd = quotes.filter(q => q.currency === "USD" && Number.isFinite(q.price));
  const removed = quotes.filter(q => !(q.currency === "USD" && Number.isFinite(q.price)));
  if (!usd.length) throw new Error("no_usd_quote");
  if (usd.length === 1) return { price: usd[0].price, confidence: "single", used: usd, removed };
  const prices = usd.map(q => q.price).sort((a,b)=>a-b);
  const mid = prices[Math.floor(prices.length/2)];
  const dev = Math.max(...usd.map(q => Math.abs(q.price/mid - 1)));
  return { price: mid, confidence: dev > maxDev ? "conflict" : "agree", used: usd, removed };
}
