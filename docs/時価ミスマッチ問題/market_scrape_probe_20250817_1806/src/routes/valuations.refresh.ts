import type { Request, Response } from "express";
import { fetchLatestUSQuote } from "../market";
export async function refreshValuationHandler(req: Request, res: Response) {
  try {
    const assetId = req.params.assetId;
    const { ticker, exchange, yahooHost } = Object(req.body || {});
    const { quotes, aggregate, keys } = await fetchLatestUSQuote({ ticker, exchange }, { yahooHost: yahooHost === "co.jp" ? "co.jp" : "com" });
    const valuation_id = Math.floor(Math.random()*1e9);
    return res.json({ assetId, price_usd: aggregate.price, confidence: aggregate.confidence, sources: quotes.map(q=>({ name: q.provider, price: q.price, currency: q.currency, url: q.url })), valuation_id, keys });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
