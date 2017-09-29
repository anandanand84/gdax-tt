var ccxt:any = require('ccxt'); 

export class CCXTProductMap {
    private exchange:any;

    getExchange() {
        return this.exchange;
    }

    getMarket(genericProduct:string) {
        return this.exchange.markets[genericProduct];
    }
    
    getExchangeProduct(genericProduct:string):string {
        if(!this.exchange.markets[genericProduct]) {
            console.trace('Generic Product not found');
            return null;
        }
        return this.exchange.markets[genericProduct]['id']
    }

    getAvailableProducts():string[] {
        return this.exchange.symbols;
    }

    getGenericProduct(exchangeProduct:string):string {
        if(!this.exchange.marketsById[exchangeProduct]) {
            console.trace('Exchange Product not found');
            return null;
        }
        return this.exchange.marketsById[exchangeProduct]['symbol']
    }

    async configureProductMap(exchangeToConfigure:string) {
        const EXCHANGE = process.env.Exchange || exchangeToConfigure;
        switch(EXCHANGE) {
            case "GDAX":
                this.exchange = new ccxt.gdax()
                break;
            case "Bitfinex":
                this.exchange  = new ccxt.bitfinex ()
                break;
            case "Bittrex":
                this.exchange = new ccxt.bittrex()
                break;
            case "Poloniex":
                this.exchange  = new ccxt.poloniex ()
                break;
        }
        await this.exchange.loadMarkets ();
    }
}

export class ProductMap {
    static ExchangeMap = new Map<string, CCXTProductMap>();

    static async configureExchange(exchange:string) {
        let exchangeMap = new CCXTProductMap();;
        await exchangeMap.configureProductMap(exchange);
        ProductMap.ExchangeMap.set(exchange, exchangeMap);
    }
}