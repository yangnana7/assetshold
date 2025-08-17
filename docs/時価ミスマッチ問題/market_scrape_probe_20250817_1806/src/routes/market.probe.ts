import type { Request, Response } from "express";
import { fetchLatestUSQuote } from "../market";
export async function probeHandler(req: Request, res: Response) {
  try {
    const ticker = String(req.query.ticker || "");
    const exchange = String(req.query.exchange || "");
    const providers = String(req.query.providers || "yahoo,google").split(",").map(s=>s.trim()).filter(Boolean) as any;
    const yahooHost = (String(req.query.yahoo_host || "com") === "co.jp" ? "co.jp" : "com") as "com"|"co.jp";
    const result = await fetchLatestUSQuote({ ticker, exchange }, { providers, yahooHost });
    return res.json({ resolved: { ticker, exchange, keys: result.keys, yahooHost }, fetches: result.quotes, aggregate: result.aggregate, errors: result.errors });
  } catch (e: any) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
