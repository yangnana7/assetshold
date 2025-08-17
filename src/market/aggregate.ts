function aggregate(quotes, opts) {
  const { maxDev = 0.01 } = opts || {};
  
  // Filter for USD quotes only
  const usd = quotes.filter(q => q.currency === "USD" && Number.isFinite(q.price));
  const removed = quotes.filter(q => !(q.currency === "USD" && Number.isFinite(q.price)));
  
  if (!usd.length) {
    throw new Error("no_usd_quote");
  }
  
  if (usd.length === 1) {
    return { price: usd[0].price, confidence: "single", used: usd, removed };
  }
  
  // Calculate median price
  const prices = usd.map(q => q.price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  
  // Check for price deviation
  const maxDeviation = Math.max(...usd.map(q => Math.abs(q.price / median - 1)));
  const confidence = maxDeviation > maxDev ? "conflict" : "agree";
  
  return { price: median, confidence, used: usd, removed };
}

module.exports = { aggregate };