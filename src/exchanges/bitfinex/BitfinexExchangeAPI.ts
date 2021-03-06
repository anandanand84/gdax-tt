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

import { AuthenticatedExchangeAPI, Balances } from '../AuthenticatedExchangeAPI';
import { Product, PublicExchangeAPI, Ticker } from '../PublicExchangeAPI';
import { AggregatedLevelWithOrders, BookBuilder } from '../../lib/BookBuilder';
import * as BitfinexAuth from './BitfinexAuth';
import {
    BitfinexBalance, BitfinexOrderRequest, BitfinexOrderType, BitfinexResult, BitfinexSuccessfulOrderExecution, BitfinexTransferRequest, BitfinexWallet, isBFWallet
} from './BitfinexAuth';
import { Logger } from '../../utils/Logger';
// import { PRODUCT_MAP, REVERSE_CURRENCY_MAP, REVERSE_PRODUCT_MAP } from './BitfinexCommon';
import { ProductMap } from '../ProductMap';
import { CryptoAddress, ExchangeTransferAPI, TransferRequest, TransferResult, WithdrawalRequest } from '../ExchangeTransferAPI';
import { ExchangeAuthConfig } from '../AuthConfig';
import { Big, BigJS } from '../../lib/types';
import { PlaceOrderMessage } from '../../core/Messages';
import { LiveOrder } from '../../lib/Orderbook';
import request = require('superagent');
import Response = request.Response;

const API_V1 = 'https://api.bitfinex.com/v1';

export interface BitfinexConfig {
    auth?: ExchangeAuthConfig;
    logger?: Logger;
}

const ORDER_TYPE_MAP: { [index: string]: BitfinexOrderType } = {
    limit: 'exchange limit',
    market: 'exchange market',
    stop: 'exchange stop'
};

export interface BitfinexRESTOrder {
    price: string;
    amount: string;
    timestamp: string;
}

export interface BitfinexOrderbook {
    bids: BitfinexRESTOrder[];
    asks: BitfinexRESTOrder[];
}

export interface BitfinexProduct {
    pair: string;
    price_precision: number;
    initial_margin: string;
    minimum_margin: string;
    maximum_order_size: string;
    minimum_order_size: string;
    expiration: string;
}

/**
 * An adapter class that maps the standardized API calls to Bitfinex's API interface
 */
export class BitfinexExchangeAPI implements PublicExchangeAPI, AuthenticatedExchangeAPI, ExchangeTransferAPI {
    /**
     * Returns the Bitfinex product that's equivalent to the given Generic product. If it doesn't exist,
     * return the given product
     * @param genericProduct
     * @returns {string} Bitfinex product code
     */
    static product(genericProduct: string) {
        return ProductMap.ExchangeMap.get('Bitfinex').getExchangeProduct(genericProduct) || genericProduct;
    }

    static genericProduct(exchangeProduct: string) {
        return ProductMap.ExchangeMap.get('Bitfinex').getGenericProduct(exchangeProduct) || exchangeProduct;
    }

    static getMarket(genericProduct: string) {
        return ProductMap.ExchangeMap.get('Bitfinex').getMarket(genericProduct);
    }
    
    static getMarketForExchangeProduct(exchangeProduct: string) {
        return ProductMap.ExchangeMap.get('Bitfinex').getMarket(BitfinexExchangeAPI.genericProduct(exchangeProduct));
    }

    static convertBSOPToOrder(bfOrder: BitfinexSuccessfulOrderExecution): LiveOrder {
        return {
            time: new Date(+bfOrder.timestamp * 1000),
            id: bfOrder.id.toString(),
            productId: BitfinexExchangeAPI.genericProduct(bfOrder.symbol),
            size: Big(bfOrder.executed_amount),
            price: Big(bfOrder.price),
            side: bfOrder.side,
            status: bfOrder.is_live ? 'open' : 'done',
            extra: {
                exchange: bfOrder.exchange,
                aveExecutionPrice: bfOrder.avg_execution_price,
                remainingAmount: bfOrder.remaining_amount,
                type: bfOrder.type
            }
        };
    }

    owner: string;
    private auth: ExchangeAuthConfig;
    private logger: Logger;

    constructor(config: BitfinexConfig) {
        this.owner = 'Bitfinex';
        this.auth = config.auth && config.auth.key && config.auth.secret ? config.auth : undefined;
        this.logger = config.logger;
    }

    loadProducts(): Promise<Product[]> {
        return request.get(`${API_V1}/symbols_details`)
            .accept('application/json')
            .then((res: Response) => {
                if (res.status !== 200) {
                    throw new Error('loadProducts did not get the expected response from the server. ' + res.body);
                }
                const bfProducts: BitfinexProduct[] = res.body;
                const products: Product[] = bfProducts.map((prod: BitfinexProduct) => {
                    const base = prod.pair.slice(0, 3);
                    const quote = prod.pair.slice(3, 6);
                    let ccxtMarket = BitfinexExchangeAPI.getMarketForExchangeProduct(prod.pair);
                    return {
                        id: BitfinexExchangeAPI.genericProduct(prod.pair) || prod.pair,
                        baseCurrency: ccxtMarket.base || base,
                        quoteCurrency: ccxtMarket.quote || quote,
                        baseMinSize: Big(prod.minimum_order_size),
                        baseMaxSize: Big(prod.maximum_order_size),
                        quoteIncrement: Big(prod.minimum_order_size)
                    };
                });
                return products;
            });
    }

    loadMidMarketPrice(genericProduct: string): Promise<BigJS> {
        return this.loadTicker(genericProduct).then((ticker: Ticker) => {
            return ticker.bid.plus(ticker.ask).times(0.5);
        });
    }

    loadOrderbook(genericProduct: string): Promise<BookBuilder> {
        const product = BitfinexExchangeAPI.product(genericProduct);
        return request.get(`${API_V1}/book/${product}`)
            .query({ grouped: 1 })
            .accept('application/json')
            .then((res: Response) => {
                if (res.status !== 200) {
                    throw new Error('loadOrderbook did not get the expected response from the server. ' + res.body);
                }
                return this.convertBitfinexBookToGdaxBook(res.body as BitfinexOrderbook);
            });
    }

    loadTicker(genericProduct: string): Promise<Ticker> {
        const product = BitfinexExchangeAPI.product(genericProduct);
        return request.get(`${API_V1}/pubticker/${product}`)
            .accept('application/json')
            .then((res: Response) => {
                if (res.status !== 200) {
                    throw new Error('loadTicker did not get the expected response from the server. ' + res.body);
                }
                const ticker: any = res.body;
                return {
                    productId: genericProduct,
                    ask: ticker.ask ? Big(ticker.ask) : null,
                    bid: ticker.bid ? Big(ticker.bid) : null,
                    price: Big(ticker.last_price || 0),
                    volume: Big(ticker.volume || 0),
                    time: new Date(+ticker.timestamp * 1000)
                };
            });
    }

    checkAuth(): Promise<ExchangeAuthConfig> {
        return new Promise((resolve, reject) => {
            if (this.auth === null) {
                return reject(new Error('You cannot make authenticated requests if a ExchangeAuthConfig object was not provided to the BitfinexExchangeAPI constructor'));
            }
            return resolve(this.auth);
        });
    }

    placeOrder(order: PlaceOrderMessage): Promise<LiveOrder> {
        return this.checkAuth().then((auth: ExchangeAuthConfig) => {
            const bfOrder: BitfinexOrderRequest = {
                product_id: BitfinexExchangeAPI.product(order.productId),
                size: order.size,
                price: order.price,
                side: order.side,
                type: ORDER_TYPE_MAP[order.type],
                post_only: !!(order.postOnly as any)
            };
            return BitfinexAuth.placeOrder(auth, bfOrder).then((result: BitfinexSuccessfulOrderExecution) => {
                if (this.logger) {
                    this.logger.log('debug', 'Order placed on Bitfinex', result);
                }
                return BitfinexExchangeAPI.convertBSOPToOrder(result);
            });
        });
    }

    cancelOrder(id: string): Promise<string> {
        return this.checkAuth().then((auth: ExchangeAuthConfig) => {
            return BitfinexAuth.cancelOrder(auth, parseInt(id, 10)).then((result: BitfinexSuccessfulOrderExecution) => {
                if (this.logger) {
                    this.logger.log('debug', 'Order cancelled on Bitfinex', result);
                }
                return result.id.toString();
            });
        });
    }

    cancelAllOrders(): Promise<string[]> {
        return this.checkAuth().then((auth: ExchangeAuthConfig) => {
            return BitfinexAuth.cancelAllOrders(auth).then((result: BitfinexResult) => {
                if (this.logger) {
                    this.logger.log('debug', 'All Orders cancelled on Bitfinex', result);
                }
                return [];
            });
        });
    }

    loadOrder(id: string): Promise<LiveOrder> {
        return this.checkAuth().then((auth: ExchangeAuthConfig) => {
            return BitfinexAuth.orderStatus(auth, parseInt(id, 10)).then((result: BitfinexSuccessfulOrderExecution) => {
                if (this.logger) {
                    this.logger.log('debug', 'Bitfinex Order status', result);
                }
                return BitfinexExchangeAPI.convertBSOPToOrder(result);
            });
        });
    }

    loadAllOrders(): Promise<LiveOrder[]> {
        return this.checkAuth().then((auth: ExchangeAuthConfig) => {
            return BitfinexAuth.activeOrders(auth).then((results: BitfinexSuccessfulOrderExecution[]) => {
                if (this.logger) {
                    this.logger.log('debug', `${results.length} Bitfinex active orders retrieved`);
                }
                return results.map((order) => BitfinexExchangeAPI.convertBSOPToOrder(order));
            });
        });
    }

    loadBalances(): Promise<Balances> {
        return this.checkAuth().then((auth: ExchangeAuthConfig) => {
            return BitfinexAuth.loadBalances(auth).then((results: BitfinexBalance[]) => {
                if (this.logger) {
                    this.logger.log('debug', 'Bitfinex wallet balances retrieved', results);
                }
                const balances: Balances = {};
                results.forEach((wallet: BitfinexBalance) => {
                    if (!balances[wallet.type]) {
                        balances[wallet.type] = {};
                    }
                    const cur = wallet.currency.toUpperCase();
                    balances[wallet.type][cur] = {
                        available: Big(wallet.available),
                        balance: Big(wallet.amount)
                    };
                });
                return balances;
            });
        });
    }

    // -------------------------- Transfer methods -------------------------------------------------

    requestCryptoAddress(cur: string): Promise<CryptoAddress> {
        return undefined;
    }

    requestTransfer(req: TransferRequest): Promise<TransferResult> {
        if (!isBFWallet(req.walletIdFrom)) {
            return Promise.reject(new Error(`walletIdFrom "${req.walletIdFrom} is not a valid Bitfinex Wallet name`));
        }
        if (!isBFWallet(req.walletIdTo)) {
            return Promise.reject(new Error(`walletIdTo "${req.walletIdTo} is not a valid Bitfinex Wallet name`));
        }
        return this.checkAuth().then<TransferResult>((auth: ExchangeAuthConfig) => {
            const bfRequest: BitfinexTransferRequest = {
                amount: req.amount.toString(),
                currency: req.currency,
                walletfrom: req.walletIdFrom as BitfinexWallet,
                walletto: req.walletIdTo as BitfinexWallet
            };
            return BitfinexAuth.transfer(auth, bfRequest).then<TransferResult>((response: Response) => {
                if (response.status === 200) {
                    const bfResult: any = response.body[0];
                    return {
                        success: bfResult.status === 'success',
                        details: bfResult.message
                    };
                }
                const err = new Error('Bitfinex transfer request failed');
                (err as any).details = response.body;
                return Promise.reject(err);
            });
        });
    }

    requestWithdrawal(req: WithdrawalRequest): Promise<TransferResult> {
        return undefined;
    }

    transfer(cur: string, amount: BigJS, from: string, to: string, options: any): Promise<TransferResult> {
        return undefined;
    }

    // -------------------------- Helper methods -------------------------------------------------

    convertBitfinexBookToGdaxBook(bfBook: BitfinexOrderbook): BookBuilder {
        const book = new BookBuilder(this.logger);
        bfBook.asks.forEach((order: BitfinexRESTOrder) => {
            addToLevel('sell', order);
        });
        bfBook.bids.forEach((order: BitfinexRESTOrder) => {
            addToLevel('buy', order);
        });
        // The 'websocket feed' will start counting from 1
        book.sequence = 0;
        return book;

        function addToLevel(side: string, order: BitfinexRESTOrder) {
            try {
                book.addLevel(side, convertOrder(side, order));
            } catch (err) {
                const newSize = Big(order.amount).abs().plus(book.getOrder(order.price).size);
                order.amount = newSize.toString();
                book.modify(order.price, newSize, side);
            }
        }

        function convertOrder(side: string, order: BitfinexRESTOrder): AggregatedLevelWithOrders {
            const price: BigJS = Big(order.price);
            const size: BigJS = Big(order.amount).abs();
            const level = new AggregatedLevelWithOrders(price);
            level.addOrder({
                id: order.price,
                price: price,
                size: size,
                side: side
            });
            return level;
        }
    }
}
