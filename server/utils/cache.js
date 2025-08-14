// Cache helpers centralizing price_cache access and in-memory request coalescing
const { dbGet, dbRun } = require('./db');

function createCache(db) {
  const fetchLocks = new Map();

  async function getCachedPrice(key, ttl) {
    const row = await dbGet(db, 'SELECT * FROM price_cache WHERE key = ? ORDER BY fetched_at DESC LIMIT 1', [key]);
    if (!row) return null;
    const fetchedAt = new Date(row.fetched_at);
    const now = new Date();
    const isExpired = now - fetchedAt > ttl;
    return {
      data: JSON.parse(row.payload),
      stale: isExpired,
      fetchedAt,
    };
  }

  async function setCachedPrice(key, payload) {
    const fetchedAt = new Date().toISOString();
    const payloadJson = JSON.stringify(payload);
    await dbRun(db, 'INSERT OR REPLACE INTO price_cache (key, payload, fetched_at) VALUES (?, ?, ?)', [key, payloadJson, fetchedAt]);
  }

  async function fetchWithCache(key, ttl, fetchFn) {
    if (fetchLocks.has(key)) return fetchLocks.get(key);

    const cached = await getCachedPrice(key, ttl);

    if (cached && !cached.stale) {
      return { ...cached.data, stale: false };
    }

    const fetchPromise = (async () => {
      try {
        const data = await fetchFn();
        await setCachedPrice(key, data);
        return { ...data, stale: false };
      } catch (error) {
        if (cached) {
          // Return stale cache on failure
          return { ...cached.data, stale: true };
        }
        throw error;
      }
    })();

    fetchLocks.set(key, fetchPromise);
    try {
      return await fetchPromise;
    } finally {
      fetchLocks.delete(key);
    }
  }

  return { getCachedPrice, setCachedPrice, fetchWithCache };
}

// Utility: read FX rate (XXX->JPY) from cache table
async function getFxFromCacheJPY(db, currency) {
  if (!currency || String(currency).toUpperCase() === 'JPY') return 1;
  const pair = String(currency).toUpperCase() + 'JPY';
  const row = await dbGet(db, 'SELECT payload FROM price_cache WHERE key=? ORDER BY fetched_at DESC LIMIT 1', ['fx:' + pair]);
  if (!row) return null;
  try {
    const js = JSON.parse(row.payload);
    const price = js.price ?? js.rate ?? js.value;
    if (typeof price === 'number' && price > 0) return price;
  } catch (_) {}
  return null;
}

module.exports = { createCache, getFxFromCacheJPY };

