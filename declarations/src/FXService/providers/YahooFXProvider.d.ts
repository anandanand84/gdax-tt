import { CurrencyPair, FXObject, FXProvider } from '../FXProvider';
export default class YahooFinanceFXProvider extends FXProvider {
    readonly name: string;
    protected downloadCurrentRate(pair: CurrencyPair): Promise<FXObject>;
    protected supportsPair(pair: CurrencyPair): Promise<boolean>;
    private isSupportedPair(pair);
}
