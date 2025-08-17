import { fetch } from "undici";
const CACHE = new Map<string, { html: string; ts: number }>();
const TTL_MS = 5 * 60 * 1000;
export async function fetchHtml(url: string, opts?: { timeoutMs?: number; bypassCache?: boolean }) {
  const now = Date.now();
  const cached = CACHE.get(url);
  if (!opts?.bypassCache && cached && now - cached.ts < TTL_MS) return cached.html;
  const ac = new AbortController();
  const to = setTimeout(() => ac.abort(), opts?.timeoutMs ?? 3000);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { "user-agent":"Mozilla/5.0", "accept":"text/html,application/xhtml+xml" }});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    CACHE.set(url, { html, ts: now });
    return html;
  } finally { clearTimeout(to); }
}
