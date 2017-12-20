import { ExchangeFeed } from '../ExchangeFeed';
import * as GI from './GeminiInterfaces';
export declare const GEMINI_API_URL = "https://api.gemini.com/v1";
export declare const GEMINI_WS_FEED = "wss://api.gemini.com/v1/marketdata/";
export declare class GeminiMarketFeed extends ExchangeFeed {
    readonly owner: string;
    readonly feedUrl: string;
    static product(genericProduct: string): string;
    static genericProduct(exchangeProduct: string): string;
    static getMarket(genericProduct: string): any;
    static getMarketForExchangeProduct(exchangeProduct: string): any;
    constructor(config: GI.GeminiMarketFeedConfig);
    protected getWebsocketUrlForProduct(product: string): string;
    protected handleMessage(msg: string, productId?: string): void;
    protected onOpen(): void;
    private processUpdate(update);
    private createSnapshotMessage(update);
    private processTrade(event, update);
    private processChange(event, update);
    private processAuction(event, update);
}
