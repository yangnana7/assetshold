import type { Request, Response } from "express";
import { fetchLatestUSQuote } from "../market";
import type { ResolveInput } from "../market/types";

export async function refreshValuationHandler(req: Request, res: Response) {
  try {
    const assetId = req.params.assetId;
    const { ticker, exchange } = (req.body || {}) as ResolveInput;
    const { quotes, aggregate, keys } = await fetchLatestUSQuote({ ticker, exchange });
    const valuation_id = Math.floor(Math.random()*1e9);
    return res.json({
      assetId,
      price_usd: aggregate.price,
      confidence: aggregate.confidence,
      sources: quotes.map(q=>({ name: q.provider, price: q.price, url: q.url })),
      valuation_id,
      note: `no-API HTML scrape / ${new Date().toISOString()}`,
      keys,
    });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
