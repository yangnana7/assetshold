export type Quote = { provider: "yahoo"|"google"|"marketwatch"; price: number; currency: string; ts: number; url: string; host?: "com"|"co.jp" };
export type ResolveKeys = { canonical: string; yahoo: string; google: string; marketwatch: string };
export type ResolveInput = { ticker: string; exchange?: string };
export type AggregateResult = { price: number; confidence: "single"|"agree"|"conflict"; used: Quote[]; removed: Quote[] };
