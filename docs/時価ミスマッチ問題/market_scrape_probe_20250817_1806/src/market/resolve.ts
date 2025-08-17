import fs from "node:fs";
import path from "node:path";
import type { ResolveInput, ResolveKeys } from "./types";

const registryPath = path.resolve(process.cwd(), "symbol_registry.json");
let REGISTRY: any = null;
function loadRegistry() { if (!REGISTRY) REGISTRY = JSON.parse(fs.readFileSync(registryPath, "utf-8")); return REGISTRY; }
const normalize = (t: string) => t.trim().toUpperCase().replace(/\s+/g,"").replace(/—|–/g,"-");
function guessExchange(t: string, exchange?: string) { const x=(exchange||"").toUpperCase(); if (x) return x; return /(AAPL|MSFT|GOOG|GOOGL|META|NVDA)/.test(t) ? "NASDAQ" : "NYSE"; }

export function resolveKeys(input: ResolveInput): ResolveKeys {
  const reg = loadRegistry(); const t0 = normalize(input.ticker);
  const item = reg.tickers.find((x:any)=>[x.canonical,...(x.aliases||[])].map((s:string)=>normalize(s)).includes(t0));
  const canonical = item?.canonical || t0;
  const exch = (input.exchange || item?.exchange || guessExchange(canonical)).toUpperCase();
  const yahoo = (item?.yahoo_key || canonical).replace(/\./g,"-");
  const google = item?.google_key || `${canonical}:${exch}`;
  const marketwatch = (item?.marketwatch_key || canonical).toLowerCase().replace(/\./g,"-");
  return { canonical, yahoo, google, marketwatch };
}
