/// <reference types="bignumber.js" />
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
export declare class BittrexAPI implements PublicExchangeAPI, AuthenticatedExchangeAPI {
    readonly owner: string;
    readonly logger: Logger;
    static product(genericProduct: string): string;
    static genericProduct(exchangeProduct: string): string;
    static getMarket(genericProduct: string): any;
    static getMarketForExchangeProduct(exchangeProduct: string): any;
    constructor(auth: ExchangeAuthConfig, logger: Logger);
    loadProducts(): Promise<Product[]>;
    loadMidMarketPrice(genericProduct: string): Promise<BigNumber.BigNumber>;
    loadOrderbook(genericProduct: string): Promise<BookBuilder>;
    loadTicker(genericProduct: string): Promise<Ticker>;
    placeOrder(order: PlaceOrderMessage): Promise<LiveOrder>;
    cancelOrder(id: string): Promise<string>;
    cancelAllOrders(product: string): Promise<string[]>;
    loadOrder(id: string): Promise<LiveOrder>;
    loadAllOrders(genericProduct: string): Promise<LiveOrder[]>;
    loadBalances(): Promise<Balances>;
}
