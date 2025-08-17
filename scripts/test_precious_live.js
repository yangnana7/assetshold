// Quick live test for precious metal providers
const { getGoldJPYPerGram } = require('../providers/metal/TanakaProvider');
const { getMitsubishiJPYPerGram } = require('../providers/metal/MitsubishiProvider');
const { TanakaPreciousMetalProvider } = require('../providers/tanaka');

(async () => {
  try {
    console.log('Testing Tanaka (gold)...');
    const t = await getGoldJPYPerGram();
    console.log('[Tanaka] OK:', t);
  } catch (e) {
    console.error('[Tanaka] FAILED:', e && e.message || e);
  }

  try {
    console.log('Testing Mitsubishi (gold)...');
    const m = await getMitsubishiJPYPerGram('gold');
    console.log('[Mitsubishi] OK:', m);
  } catch (e) {
    console.error('[Mitsubishi] FAILED:', e && e.message || e);
  }

  try {
    console.log('Testing registry provider (gold)...');
    const prov = new TanakaPreciousMetalProvider();
    const p = await prov.getQuote('gold', 'JP');
    console.log('[Provider] OK:', { price: p.price, currency: p.currency, as_of: p.asOf, source: prov.name });
  } catch (e) {
    console.error('[Provider] FAILED:', e && e.message || e);
  }
})();

