// Provider registry and factory (BDD requirement 4.3)

const { NoopProvider, NoopFxProvider } = require('./base');
const { YahooStockProvider, YahooFxProvider } = require('./yahoo');
const { TanakaPreciousMetalProvider } = require('./tanaka');
const ExchangeRatesFxProvider = require('./fx/ExchangeRatesFxProvider');
const OandaFxProvider = require('./fx/OandaFxProvider');
const GoogleFinanceFxProvider = require('./fx/GoogleFinanceFxProvider');
const MultiSourceFxProvider = require('./fx/MultiSourceFxProvider');
const GoogleFinanceStockProvider = require('./stock/GoogleFinanceStockProvider');

function makeStockProvider(marketEnable = false) {
  if (!marketEnable) {
    console.log('Stock provider: noop (market disabled)');
    return new NoopProvider();
  }

  // Priority: yahoo (more stable for US) -> google-finance (fallback) -> noop
  try {
    console.log('Stock provider: yahoo');
    return new YahooStockProvider();
  } catch (yahooError) {
    try {
      console.log('Stock provider: google-finance (fallback)');
      return new GoogleFinanceStockProvider();
    } catch (error) {
      console.log('Stock provider: noop (all providers unavailable)');
      return new NoopProvider();
    }
  }
}

function makeFxProvider(marketEnable = false) {
  if (!marketEnable) {
    console.log('FX provider: noop (market disabled)');
    return new NoopFxProvider();
  }

  // Priority: google-finance -> multi-source -> oanda-style -> exchangerate-api -> yahoo -> noop
  try {
    console.log('FX provider: google-finance');
    return new GoogleFinanceFxProvider();
  } catch (error) {
    try {
      console.log('FX provider: multi-source (fallback)');
      return new MultiSourceFxProvider();
    } catch (multiError) {
      try {
        console.log('FX provider: oanda-style (fallback)');
        return new OandaFxProvider();
      } catch (oandaError) {
        try {
          console.log('FX provider: exchangerate-api (fallback)');
          return new ExchangeRatesFxProvider();
        } catch (exchangeError) {
          try {
            console.log('FX provider: yahoo (fallback)');
            return new YahooFxProvider();
          } catch (yahooError) {
            console.log('FX provider: noop (all providers unavailable)');
            return new NoopFxProvider();
          }
        }
      }
    }
  }
}

function makePreciousMetalProvider(marketEnable = false) {
  if (!marketEnable) {
    console.log('Precious Metal provider: noop (market disabled)');
    return new NoopProvider();
  }

  try {
    console.log('Precious Metal provider: tanaka');
    return new TanakaPreciousMetalProvider();
  } catch (error) {
    console.log('Precious Metal provider: noop (tanaka unavailable)');
    return new NoopProvider();
  }
}

module.exports = {
  makeStockProvider,
  makeFxProvider,
  makePreciousMetalProvider
};
