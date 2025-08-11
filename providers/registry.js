// Provider registry and factory (BDD requirement 4.3)

const { NoopProvider, NoopFxProvider } = require('./base');
const { YahooStockProvider, YahooFxProvider } = require('./yahoo');

function makeStockProvider(marketEnable = false) {
  if (!marketEnable) {
    console.log('Stock provider: noop (market disabled)');
    return new NoopProvider();
  }

  // Priority: yahoo (API key free) -> stooq (fallback) -> noop (dummy)
  try {
    console.log('Stock provider: yahoo');
    return new YahooStockProvider();
  } catch (error) {
    console.log('Stock provider: noop (yahoo unavailable)');
    return new NoopProvider();
  }
}

function makeFxProvider(marketEnable = false) {
  if (!marketEnable) {
    console.log('FX provider: noop (market disabled)');
    return new NoopFxProvider();
  }

  try {
    console.log('FX provider: yahoo');
    return new YahooFxProvider();
  } catch (error) {
    console.log('FX provider: noop (yahoo unavailable)');
    return new NoopFxProvider();
  }
}

module.exports = {
  makeStockProvider,
  makeFxProvider
};