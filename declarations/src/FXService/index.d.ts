export * from './FXService';
export * from './FXRateCalculator';
export * from './FXProvider';
import * as CoinMarketCapProvider from './providers/CoinMarketCapProvider';
import * as OpenExchangeProvider from './providers/OpenExchangeProvider';
import * as YahooFXProvider from './providers/YahooFXProvider';
export declare const Providers: {
    CoinMarketCapProvider: typeof CoinMarketCapProvider;
    OpenExchangeProvider: typeof OpenExchangeProvider;
    YahooFXProvider: typeof YahooFXProvider;
};
import SimpleRateCalculator from './calculators/SimpleRateCalculator';
export declare const Calculators: {
    SimpleRateCalculator: typeof SimpleRateCalculator;
};
