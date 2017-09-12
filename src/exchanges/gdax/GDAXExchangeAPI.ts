import { ProductMap } from '../ProductMap';
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
import { GDAXOrder, GDAXOrderRequest } from './GDAXMessages';
import { ExchangeAuthConfig } from '../AuthConfig';
import { Big, BigJS, ZERO } from '../../lib/types';
import { ConsoleLoggerFactory, Logger } from '../../utils/Logger';
import { PlaceOrderMessage } from '../../core/Messages';
import { Level3Order, LiveOrder } from '../../lib/Orderbook';
import request = require('superagent');
import querystring = require('querystring');
import Buffer = require('buffer');
import crypto = require('crypto');
import Response = request.Response;

export const GDAX_API_URL = 'https://api.gdax.com';

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

interface OrderPage {
    after: string;
    orders: GDAXOrder[];
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

export class GDAXExchangeAPI implements PublicExchangeAPI, AuthenticatedExchangeAPI {
    owner: string;
    quoteCurrency: string;
    baseCurrency: string;
    private _apiURL: string;
    private auth: GDAXAuthConfig;
    private logger: Logger;

    constructor(options: GDAXConfig) {
        this.owner = 'GDAX';
        this._apiURL = options.apiUrl || GDAX_API_URL;
        this.auth = options.auth;
        this.logger = options.logger || ConsoleLoggerFactory();
    }

    get apiURL(): string {
        return this._apiURL;
    }

    static product(genericProduct: string) {
        return ProductMap.ExchangeMap.get('GDAX').getExchangeProduct(genericProduct) || genericProduct;
    }

    static genericProduct(exchangeProduct: string) {
        return ProductMap.ExchangeMap.get('GDAX').getGenericProduct(exchangeProduct) || exchangeProduct;
    }

    static getMarket(genericProduct: string) {
        return ProductMap.ExchangeMap.get('GDAX').getMarket(genericProduct);
    }
    
    static getMarketForExchangeProduct(exchangeProduct: string) {
        return ProductMap.ExchangeMap.get('GDAX').getMarket(GDAXExchangeAPI.genericProduct(exchangeProduct));
    }

    loadProducts(): Promise<Product[]> {
        const url = `${this.apiURL}/products`;
        return request.get(url)
            .accept('application/json')
            .then((res) => {
                if (res.status !== 200) {
                    throw new Error('loadProducts did not get the expected response from the server. ' + res.body);
                }
                const products: GDAXAPIProduct[] = res.body;
                return products.map((prod: GDAXAPIProduct) => {
                    let ccxtMarket = GDAXExchangeAPI.getMarketForExchangeProduct(prod.id);
                    return {
                        id: GDAXExchangeAPI.genericProduct(prod.id) || prod.id,
                        baseCurrency: ccxtMarket.base || prod.base_currency,
                        quoteCurrency: ccxtMarket.quote || prod.quote_currency,
                        baseMinSize: Big(prod.base_min_size),
                        baseMaxSize: Big(prod.base_max_size),
                        quoteIncrement: Big(prod.quote_increment)
                    } as Product;
                });
            });
    }

    loadMidMarketPrice(genericProduct: string): Promise<BigJS> {
        return this.loadTicker(genericProduct).then((ticker) => {
            if (!ticker || !ticker.bid || !ticker.ask) {
                throw new Error('Loading midmarket price failed because ticker data was incomplete or unavailable');
            }
            return ticker.ask.plus(ticker.bid).times(0.5);
        });
    }

    loadOrderbook(genericProduct: string): Promise<BookBuilder> {
        return this.loadFullOrderbook(genericProduct);
    }

    loadFullOrderbook(genericProduct: string): Promise<BookBuilder> {
        let exchangeProduct = GDAXExchangeAPI.product(genericProduct);
        return this.loadGDAXOrderbook({ product: exchangeProduct, level: 3 }).then((body) => {
            return this.buildBook(body);
        });
    }

    loadGDAXOrderbook(options: OrderbookEndpointParams): Promise<any> {
        let exchangeProduct = options.product;
        const url = `${this.apiURL}/products/${exchangeProduct}/book`;
        return request.get(url)
            .accept('application/json')
            .query({ level: options.level })
            .then((res) => {
                if (res.status !== 200) {
                    throw new Error('loadOrderbook did not get the expected response from the server. ' + res.body);
                }
                const orders = res.body;
                if (!(orders.bids && orders.asks)) {
                    throw new Error('loadOrderbook did not return an bids or asks: ' + res.body);
                }
                return res.body;
            }, (err: Error) => {
                this.logger.log('error', `Error loading snapshot for ${exchangeProduct}`, err);
                return Promise.resolve(null);
            });
    }

    loadTicker(genericProduct: string): Promise<Ticker> {
        let exchangeProduct = GDAXExchangeAPI.product(genericProduct);
        const url = `${this.apiURL}/products/${exchangeProduct}/ticker`;
        return request.get(url)
            .accept('application/json')
            .then((res) => {
                if (res.status !== 200) {
                    throw new Error('loadTicker did not get the expected response from the server. ' + res.body);
                }
                const ticker: any = res.body;
                return {
                    productId: exchangeProduct,
                    ask: ticker.ask ? Big(ticker.ask) : undefined,
                    bid: ticker.bid ? Big(ticker.bid) : undefined,
                    price: Big(ticker.price || 0),
                    size: Big(ticker.size || 0),
                    volume: Big(ticker.volume || 0),
                    time: new Date(ticker.time || new Date()),
                    trade_id: ticker.trade_id ? ticker.trade_id.toString() : '0'
                };
            });
    }

    public aggregateBook(body: any): BookBuilder {
        const book = new BookBuilder(this.logger);
        book.sequence = parseInt(body.sequence, 10);
        ['bids', 'asks'].forEach((side) => {
            let currentPrice: string;
            let order: Level3Order;
            const bookSide = side === 'bids' ? 'buy' : 'sell';
            body[side].forEach((bid: string[]) => {
                if (bid[0] !== currentPrice) {
                    // Set the price on the old level
                    if (order) {
                        book.add(order);
                    }
                    currentPrice = bid[0];
                    order = {
                        id: currentPrice,
                        price: Big(currentPrice),
                        side: bookSide,
                        size: ZERO
                    };
                }
                order.size = order.size.plus(bid[1]);
            });
            if (order) { book.add(order); }
        });
        return book;
    }

    // ----------------------------------- Authenticated API methods --------------------------------------------------//
    placeOrder(order: PlaceOrderMessage): Promise<LiveOrder> {
        let exchangeProduct = GDAXExchangeAPI.product(order.productId);
        const gdaxOrder: GDAXOrderRequest = {
            product_id: exchangeProduct,
            size: order.size,
            price: order.price,
            side: order.side,
            type: order.orderType,
            client_oid: order.clientId,
            post_only: order.postOnly,
            time_in_force: order.extra && order.extra.time_in_force,
            cancel_after: order.extra && order.extra.cancel_after,
            funds: order.funds
        };
        const apiCall = this.authCall('POST', '/orders', { body: gdaxOrder });
        return this.handleResponse<GDAXOrder>(apiCall, { order: order })
            .then((result: GDAXOrder) => {
                return GDAXOrderToOrder(result);
            }, (err: Error) => {
                this.logger.log('error', 'Placing order failed', { order: order, reason: err.message });
                return Promise.reject(err);
            });
    }

    cancelOrder(id: string): Promise<string> {
        const apiCall = this.authCall('DELETE', `/orders/${id}`, {});
        return this.handleResponse<string[]>(apiCall, { order_id: id }).then((ids: string[]) => {
            return Promise.resolve(ids[0]);
        });

    }

    cancelAllOrders(genericProduct: string): Promise<string[]> {
        const apiCall = this.authCall('DELETE', `/orders`, {});
        let exchangeProduct = GDAXExchangeAPI.product(genericProduct);
        const options = exchangeProduct ? { product_id: exchangeProduct } : null;
        return this.handleResponse<string[]>(apiCall, options).then((ids: string[]) => {
            return Promise.resolve(ids);
        });
    }

    loadOrder(id: string): Promise<LiveOrder> {
        const apiCall = this.authCall('GET', `/orders/${id}`, {});
        return this.handleResponse<GDAXOrder>(apiCall, { order_id: id }).then((order: GDAXOrder) => {
            return GDAXOrderToOrder(order);
        });
    }

    loadAllOrders(genericProduct: string): Promise<LiveOrder[]> {
        let exchangeProduct = GDAXExchangeAPI.product(genericProduct);
        const self = this;
        let allOrders: LiveOrder[] = [];
        const loop: (after: string) => Promise<LiveOrder[]> = (after: string) => {
            return self.loadNextOrders(exchangeProduct, after).then((result) => {
                const liveOrders: LiveOrder[] = result.orders.map(GDAXOrderToOrder);
                allOrders = allOrders.concat(liveOrders);
                if (result.after) {
                    return loop(result.after);
                } else {
                    return allOrders;
                }
            });
        };
        return new Promise((resolve, reject) => {
            return loop(null).then((orders) => {
                return resolve(orders);
            }, reject);
        });
    }

    loadBalances(): Promise<Balances> {
        const apiCall = this.authCall('GET', '/accounts', {});
        return this.handleResponse<GDAXAccountResponse[]>(apiCall, {}).then((accounts: GDAXAccountResponse[]) => {
            const balances: Balances = {};
            accounts.forEach((account: GDAXAccountResponse) => {
                if (!balances[account.profile_id]) {
                    balances[account.profile_id] = {};
                }
                balances[account.profile_id][account.currency] = {
                    balance: Big(account.balance),
                    available: Big(account.available)
                };
            });
            return balances;
        });
    }

    authCall(method: string, path: string, opts: AuthCallOptions): Promise<Response> {
        return this.checkAuth().then(() => {
            method = method.toUpperCase();
            const url = `${this.apiURL}${path}`;
            let body: string = '';
            let req = request(method, url)
                .accept('application/json')
                .set('content-type', 'application/json');
            if (opts.body) {
                body = JSON.stringify(opts.body);
                req.send(body);
            } else if (opts.qs && Object.keys(opts.qs).length !== 0) {
                req.query(opts.qs);
                body = '?' + querystring.stringify(opts.qs);
            }
            const signature = this.getSignature(method, path, body);
            req.set(signature);
            if (opts.headers) {
                req = req.set(opts.headers);
            }
            return Promise.resolve(req);
        });
    }

    getSignature(method: string, relativeURI: string, body: string): AuthHeaders {
        body = body || '';
        const timestamp = (Date.now() / 1000).toFixed(3);
        const what: string = timestamp + method + relativeURI + body;
        const key = new Buffer.Buffer(this.auth.secret, 'base64');
        const hmac = crypto.createHmac('sha256', key);
        const signature = hmac.update(what).digest('base64');
        return {
            'CB-ACCESS-KEY': this.auth.key,
            'CB-ACCESS-SIGN': signature,
            'CB-ACCESS-TIMESTAMP': timestamp,
            'CB-ACCESS-PASSPHRASE': this.auth.passphrase
        };
    }

    handleResponse<T>(req: Promise<Response>, meta: any): Promise<T> {
        // then<T> is required to workaround bug in TS2.1 https://github.com/Microsoft/TypeScript/issues/10977
        return req.then<T>((res: Response) => {
            if (res.status >= 200 && res.status < 300) {
                return Promise.resolve<T>(res.body as T);
            }
            const err: Error = new Error(res.body.message);
            (err as any).details = res.body;
            return Promise.reject(err);
        }).catch((err) => {
            const reason: any = err.message;
            const error: any = Object.assign(new Error('A GDAX API request failed. ' + reason), meta);
            error.reason = reason;
            return Promise.reject(error);
        });
    }

    checkAuth(): Promise<GDAXAuthConfig> {
        return new Promise((resolve, reject) => {
            if (this.auth === null) {
                return reject(new Error('You cannot make authenticated requests if a GDAXAuthConfig object was not provided to the GDAXExchangeAPI constructor'));
            }
            if (!(this.auth.key && this.auth.secret && this.auth.passphrase)) {
                return reject(new Error('You cannot make authenticated requests without providing all API credentials'));
            }
            return resolve();
        });
    }

    private buildBook(body: any): BookBuilder {
        const book = new BookBuilder(this.logger);
        book.sequence = parseInt(body.sequence, 10);
        ['bids', 'asks'].forEach((side) => {
            const bookSide = side === 'bids' ? 'buy' : 'sell';
            body[side].forEach((data: string[]) => {
                const order: Level3Order = {
                    id: data[2],
                    price: Big(data[0]),
                    side: bookSide,
                    size: Big(data[1])
                };
                book.add(order);
            });
        });
        return book;
    }

    private loadNextOrders(genericProduct: string, after: string): Promise<OrderPage> {
        let exchangeProduct = GDAXExchangeAPI.product(genericProduct);
        const qs: any = {
            status: ['open', 'pending', 'active']
        };
        if (exchangeProduct) {
            qs.product_id = exchangeProduct;
        }
        if (after) {
            qs.after = after;
        }
        return this.authCall('GET', '/orders', { qs: qs }).then((res) => {
            const cbAfter = res.header['cb-after'];
            const orders = res.body;
            return {
                after: cbAfter,
                orders: orders
            };
        });
    }
}

function GDAXOrderToOrder(order: GDAXOrder): LiveOrder {
    let genericProduct = GDAXExchangeAPI.genericProduct(order.product_id);
    return {
        price: Big(order.price),
        size: Big(order.size),
        side: order.side,
        id: order.id,
        time: new Date(order.created_at),
        productId: genericProduct,
        status: order.status,
        extra: {
            post_only: order.post_only,
            time_in_force: order.time_in_force,
            settled: order.settled,
            done_reason: order.done_reason,
            filled_size: order.filled_size,
            executed_value: order.executed_value,
            fill_fees: order.fill_fees,
            done_at: order.done_at
        }
    };
}
