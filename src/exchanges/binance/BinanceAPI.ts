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
import { ExchangeAuthConfig } from '../AuthConfig';
import { AuthenticatedExchangeAPI, Balances } from '../AuthenticatedExchangeAPI';
import { BookBuilder } from '../../lib/BookBuilder';
import { Logger } from '../../utils/Logger';
import { PlaceOrderMessage } from '../../core/Messages';
import { LiveOrder } from '../../lib/Orderbook';
import { ProductMap } from '../ProductMap';

export class BinanceAPI implements PublicExchangeAPI, AuthenticatedExchangeAPI {
    readonly owner: string;
    readonly logger: Logger;

    static product(genericProduct: string) {
        return ProductMap.ExchangeMap.get('Binance').getExchangeProduct(genericProduct) || genericProduct;
    }

    static genericProduct(exchangeProduct: string) {
        return ProductMap.ExchangeMap.get('Binance').getGenericProduct(exchangeProduct) || exchangeProduct;
    }

    static getMarket(genericProduct: string) {
        return ProductMap.ExchangeMap.get('Binance').getMarket(genericProduct);
    }
    
    static getMarketForExchangeProduct(exchangeProduct: string) {
        return ProductMap.ExchangeMap.get('Binance').getMarket(BinanceAPI.genericProduct(exchangeProduct));
    }

    constructor(auth: ExchangeAuthConfig, logger: Logger) {
        this.owner = 'Binance';
        this.logger = logger;
    }

    loadProducts(): Promise<Product[]> {
        throw ('loadProducts Not Implemented for Binance')
    }

    loadMidMarketPrice(genericProduct: string): Promise<BigNumber.BigNumber> {
        throw ('loadMidMarketPrice Not Implemented for Binance')
    }

    loadOrderbook(genericProduct: string): Promise<BookBuilder> {
        throw('loadMidMarketPrice Not Implemented for Binance')
        // const product = BinanceAPI.product(genericProduct);
        // return new Promise((resolve, reject) => {
        //     Binance.getorderbook({
        //         market: product,
        //         type: 'both',
        //         depth: 5000
        //     }, (err, data) => {
        //         if (err) {
        //             return reject(err);
        //         }
        //         if (!data.success || !data.result) {
        //             return reject(new Error('Unexpected response from Binance: ' + JSON.stringify(data)));
        //         }
        //         const bids: any = data.result.buy;
        //         const asks: any = data.result.sell;
        //         const book: BookBuilder = new BookBuilder(this.logger);
        //         bids.forEach((order: any) => {
        //             book.add({
        //                 id: order.Rate,
        //                 price: Big(order.Rate),
        //                 size: Big(order.Quantity),
        //                 side: 'buy'
        //             });
        //         });
        //         asks.forEach((order: any) => {
        //             book.add({
        //                 id: order.Rate,
        //                 price: Big(order.Rate),
        //                 size: Big(order.Quantity),
        //                 side: 'sell'
        //             });
        //         });
        //         return resolve(book);
        //     });
        // });
    }

    loadTicker(genericProduct: string): Promise<Ticker> {
        throw ('Not Implemented');
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
