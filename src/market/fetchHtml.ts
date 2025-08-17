const fetch = require('node-fetch');

const CACHE = new Map();
const TTL_MS = 5 * 60 * 1000;

async function fetchHtml(url, opts) {
  const now = Date.now();
  const cached = CACHE.get(url);
  
  if (!(opts && opts.bypassCache) && cached && now - cached.ts < TTL_MS) {
    return cached.html;
  }
  
  const ac = new AbortController();
  const timeout = (opts && opts.timeoutMs) || 3000;
  const to = setTimeout(() => ac.abort(), timeout);
  
  try {
    const res = await fetch(url, { 
      signal: ac.signal, 
      headers: { 
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", 
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" 
      }
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    
    const html = await res.text();
    CACHE.set(url, { html, ts: now });
    return html;
  } finally { 
    clearTimeout(to); 
  }
}

module.exports = { fetchHtml };