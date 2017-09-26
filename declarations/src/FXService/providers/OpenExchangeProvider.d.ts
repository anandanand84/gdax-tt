import { FXProvider, FXObject, FXProviderConfig, CurrencyPair } from '../FXProvider';
export interface OpenExchangeConfig extends FXProviderConfig {
    apiKey: string;
}
export default class OpenExchangeProvider extends FXProvider {
    private apiKey;
    constructor(config: OpenExchangeConfig);
    readonly name: string;
    protected downloadCurrentRate(pair: CurrencyPair): Promise<FXObject>;
    protected supportsPair(pair: CurrencyPair): Promise<boolean>;
}
