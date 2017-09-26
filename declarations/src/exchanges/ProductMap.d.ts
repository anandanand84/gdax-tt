export declare class CCXTProductMap {
    private exchange;
    getExchange(): any;
    getMarket(genericProduct: string): any;
    getExchangeProduct(genericProduct: string): string;
    getAvailableProducts(): string[];
    getGenericProduct(exchangeProduct: string): string;
    configureProductMap(exchangeToConfigure: string): Promise<void>;
}
export declare class ProductMap {
    static ExchangeMap: Map<string, CCXTProductMap>;
    static configureExchange(exchange: string): Promise<void>;
}
