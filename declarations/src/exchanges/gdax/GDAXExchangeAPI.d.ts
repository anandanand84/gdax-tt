/// <reference types="superagent" />
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
import { AuthenticatedExchangeAPI, Balances } from '../AuthenticatedExchangeAPI';
import { BookBuilder } from '../../lib/BookBuilder';
import { ExchangeAuthConfig } from '../AuthConfig';
import { BigJS } from '../../lib/types';
import { Logger } from '../../utils/Logger';
import { PlaceOrderMessage } from '../../core/Messages';
import { LiveOrder } from '../../lib/Orderbook';
import request = require('superagent');
import Response = request.Response;
export declare const GDAX_API_URL = "https://api.gdax.com";
export interface GDAXConfig {
    apiUrl?: string;
    auth?: GDAXAuthConfig;
    logger: Logger;
}
export interface GDAXAuthConfig extends ExchangeAuthConfig {
    passphrase: string;
}
export interface AuthHeaders {
    'CB-ACCESS-KEY': string;
    'CB-ACCESS-SIGN': string;
    'CB-ACCESS-TIMESTAMP': string;
    'CB-ACCESS-PASSPHRASE': string;
}
export interface GDAXAccountResponse {
    id: string;
    currency: string;
    balance: string;
    available: string;
    hold: string;
    profile_id: string;
}
export interface AuthCallOptions {
    body?: any;
    qs?: any;
    headers?: any;
}
export interface OrderbookEndpointParams {
    product: string;
    level: number;
}
export interface GDAXAPIProduct {
    id: string;
    base_currency: string;
    quote_currency: string;
    base_min_size: string;
    base_max_size: string;
    quote_increment: string;
    display_name: string;
}
export declare class GDAXExchangeAPI implements PublicExchangeAPI, AuthenticatedExchangeAPI {
    owner: string;
    quoteCurrency: string;
    baseCurrency: string;
    private _apiURL;
    private auth;
    private logger;
    constructor(options: GDAXConfig);
    readonly apiURL: string;
    static product(genericProduct: string): string;
    static genericProduct(exchangeProduct: string): string;
    static getMarket(genericProduct: string): any;
    static getMarketForExchangeProduct(exchangeProduct: string): any;
    loadProducts(): Promise<Product[]>;
    loadMidMarketPrice(genericProduct: string): Promise<BigJS>;
    loadOrderbook(genericProduct: string): Promise<BookBuilder>;
    loadFullOrderbook(genericProduct: string): Promise<BookBuilder>;
    loadGDAXOrderbook(options: OrderbookEndpointParams): Promise<any>;
    loadTicker(genericProduct: string): Promise<Ticker>;
    aggregateBook(body: any): BookBuilder;
    placeOrder(order: PlaceOrderMessage): Promise<LiveOrder>;
    cancelOrder(id: string): Promise<string>;
    cancelAllOrders(genericProduct: string): Promise<string[]>;
    loadOrder(id: string): Promise<LiveOrder>;
    loadAllOrders(genericProduct: string): Promise<LiveOrder[]>;
    loadBalances(): Promise<Balances>;
    authCall(method: string, path: string, opts: AuthCallOptions): Promise<Response>;
    getSignature(method: string, relativeURI: string, body: string): AuthHeaders;
    handleResponse<T>(req: Promise<Response>, meta: any): Promise<T>;
    checkAuth(): Promise<GDAXAuthConfig>;
    private buildBook(body);
    private loadNextOrders(genericProduct, after);
}
