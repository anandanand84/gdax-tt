/***************************************************************************************************************************
 * @license                                                                                                                *
 * Copyright 2017 Coinbase, Inc.                                                                                           *
 *                                                                                                                         *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance          *
 * with the License. You may obtain a copy of the License at                                                               *
 *                                                                                                                         *
 * http://www.apache.org/licenses/LICENSE-2.0                                                                              *
 *                                                                                                                         *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on     *
 * an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the                      *
 * License for the specific language governing permissions and limitations under the License.                              *
 ***************************************************************************************************************************/
import { Product, PublicExchangeAPI, Ticker } from '../PublicExchangeAPI';
import * as Bittrex from 'node-bittrex-api';
import { ExchangeAuthConfig } from '../AuthConfig';
import { AuthenticatedExchangeAPI, Balances } from '../AuthenticatedExchangeAPI';
import { Big } from '../../lib/types';
import { BookBuilder } from '../../lib/BookBuilder';
import { Logger } from '../../utils/Logger';
import { PlaceOrderMessage } from '../../core/Messages';
import { LiveOrder } from '../../lib/Orderbook';
import { ProductMap } from '../ProductMap';

export class BittrexAPI implements PublicExchangeAPI, AuthenticatedExchangeAPI {
    readonly owner: string;
    readonly logger: Logger;

    static product(genericProduct: string) {
        return ProductMap.ExchangeMap.get('Bittrex').getExchangeProduct(genericProduct) || genericProduct;
    }

    static genericProduct(exchangeProduct: string) {
        return ProductMap.ExchangeMap.get('Bittrex').getGenericProduct(exchangeProduct) || exchangeProduct;
    }

    static getMarket(genericProduct: string) {
        return ProductMap.ExchangeMap.get('Bittrex').getMarket(genericProduct);
    }
    
    static getMarketForExchangeProduct(exchangeProduct: string) {
        return ProductMap.ExchangeMap.get('Bittrex').getMarket(BittrexAPI.genericProduct(exchangeProduct));
    }

    constructor(auth: ExchangeAuthConfig, logger: Logger) {
        this.owner = 'Bittrex';
        this.logger = logger;
        Bittrex.options({
            apikey: auth.key || 'APIKEY',
            apisecret: auth.secret || 'APISECRET',
            inverse_callback_arguments: true,
            stream: false,
            cleartext: false,
            verbose: false
        });
    }

    loadProducts(): Promise<Product[]> {
        return new Promise((resolve, reject) => {
            Bittrex.getmarkets((err, data) => {
                if (err) {
                    return reject(err);
                }
                if (!data.success || !data.result) {
                    return reject(new Error('Unexpected response from Bittrex: ' + JSON.stringify(data)));
                }
                const result: Product[] = data.result.map((market: any) => {
                    let genericProduct =  ProductMap.ExchangeMap.get('Bittrex').getGenericProduct(market.MarketName);
                    let genericProductMeta =  ProductMap.ExchangeMap.get('Bittrex').getMarket(genericProduct);
                    return {
                        id: genericProduct, // same format as GDAX, so no need to map
                        baseCurrency: genericProductMeta.base,
                        quoteCurrency: genericProductMeta.quote,
                        baseMinSize: Big(market.MinTradeSize),
                        baseMaxSize: Big('1e18'),
                        quoteIncrement: Big(market.MinTradeSize)
                    };
                });
                return resolve(result);
            });
        });
    }

    loadMidMarketPrice(genericProduct: string): Promise<BigNumber.BigNumber> {
        return this.loadTicker(genericProduct).then((ticker: Ticker) => {
            return ticker.bid.plus(ticker.ask).times(0.5);
        });
    }

    loadOrderbook(genericProduct: string): Promise<BookBuilder> {
        const product = BittrexAPI.product(genericProduct);
        return new Promise((resolve, reject) => {
            Bittrex.getorderbook({
                market: product,
                type: 'both',
                depth: 5000
            }, (err, data) => {
                if (err) {
                    return reject(err);
                }
                if (!data.success || !data.result) {
                    return reject(new Error('Unexpected response from Bittrex: ' + JSON.stringify(data)));
                }
                const bids: any = data.result.buy;
                const asks: any = data.result.sell;
                const book: BookBuilder = new BookBuilder(this.logger);
                bids.forEach((order: any) => {
                    book.add({
                        id: order.Rate,
                        price: Big(order.Rate),
                        size: Big(order.Quantity),
                        side: 'buy'
                    });
                });
                asks.forEach((order: any) => {
                    book.add({
                        id: order.Rate,
                        price: Big(order.Rate),
                        size: Big(order.Quantity),
                        side: 'sell'
                    });
                });
                return resolve(book);
            });
        });
    }

    loadTicker(genericProduct: string): Promise<Ticker> {
        const product = BittrexAPI.product(genericProduct);
        return new Promise((resolve, reject) => {
            Bittrex.getticker({ market: product }, (err, data) => {
                if (err) {
                    return reject(err);
                }
                if (!data.success || !data.result) {
                    return reject(new Error('Unexpected response from Bittrex: ' + JSON.stringify(data)));
                }
                const result: Ticker = {
                    productId: genericProduct,
                    ask: Big(data.result.Ask),
                    bid: Big(data.result.Bid),
                    price: Big(data.result.Last),
                    time: new Date()
                };
                return resolve(result);
            });
        });
    }

    placeOrder(order: PlaceOrderMessage): Promise<LiveOrder> {
        throw new Error('Method not implemented.');
    }

    cancelOrder(id: string): Promise<string> {
        throw new Error('Method not implemented.');
    }

    cancelAllOrders(product: string): Promise<string[]> {
        throw new Error('Method not implemented.');
    }

    loadOrder(id: string): Promise<LiveOrder> {
        throw new Error('Method not implemented.');
    }

    loadAllOrders(genericProduct: string): Promise<LiveOrder[]> {
        throw new Error('Method not implemented.');
    }

    loadBalances(): Promise<Balances> {
        throw new Error('Method not implemented.');
    }
}
