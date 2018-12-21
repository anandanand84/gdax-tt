'use strict';
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

import { ExchangeFeed, ExchangeFeedConfig } from '../ExchangeFeed';
import { SnapshotMessage, LevelMessage, TradeMessage, ErrorMessage } from '../../core/Messages';
import { Big } from '../../lib/types';
import { OrderPool } from '../../lib/BookBuilder';
import { Level3Order, PriceLevelFactory, PriceLevelWithOrders } from '../../lib/Orderbook';
import {
    OrderbookSubscriptionRequestMessage, OrderbookResponseMessage, TradesubscriptionRequestMessage, TradesubscriptionResponseMessage, HitbtcMessage, TradeMessage as HitbtcTradeMessage, LevelDetails
} from './HitbtcInterfaces';
import { ProductMap } from '../ProductMap';


interface MessageCounter {
    base: number;
    offset: number;
}

export class HitbtcMarketFeed extends ExchangeFeed {
    readonly owner: string;
    readonly feedUrl: string;
    private counters: { [product: string]: MessageCounter };
    // Maps order IDs to the price that they exist at
    private orderIdMap: { [orderId: number]: number };
    // Hitbtc WSAPI doesn't include a sequence number, so we have to keep track if it ourselves and hope for the best.
    private seq: number;

    private requestId:number = 0;

    static product(genericProduct: string) {
        return ProductMap.ExchangeMap.get('Hitbtc').getExchangeProduct(genericProduct) || genericProduct;
    }

    static genericProduct(exchangeProduct: string) {
        return ProductMap.ExchangeMap.get('Hitbtc').getGenericProduct(exchangeProduct) || exchangeProduct;
    }

    static getMarket(genericProduct: string) {
        return ProductMap.ExchangeMap.get('Hitbtc').getMarket(genericProduct);
    }
    
    static getMarketForExchangeProduct(exchangeProduct: string) {
        return ProductMap.ExchangeMap.get('Hitbtc').getMarket(HitbtcMarketFeed.genericProduct(exchangeProduct));
    }

    constructor(config: ExchangeFeedConfig) {
        super(config);
        this.owner = 'Hitbtc';
        this.feedUrl = config.wsUrl;
        this.seq = 0;
        this.connect();
    }

    private nextSequence(product: string): number {
        let counter: MessageCounter = this.counters[product];
        if (!counter) {
            counter = this.counters[product] = { base: -1, offset: 0 };
        }
        if (counter.base < 1) {
            console.warn(`Requesting next sequence without setting snapshot sequence for product ${product}, current counter offset ${counter.offset}`);
            return -1;
        }
        counter.offset += 1;
        return counter.base + counter.offset;
    }

    private setSnapshotSequence(product: string, sequence: number): void {
        let counter: MessageCounter = this.counters[product];
        if (!counter) {
            counter = this.counters[product] = { base: -1, offset: 0 };
        }
        counter.base = sequence;
    }

    private getSnapshotSequence(product: string): number {
        const counter: MessageCounter = this.counters[product];
        return counter ? counter.base : -1;
    }

    public async subscribe(productIds: string[]) {
        this.logger.log('debug', `Subscribing to the following symbols: ${JSON.stringify(productIds)}`);
        productIds.forEach((productId: string) => {
            const subscribeOrderbookMessage:OrderbookSubscriptionRequestMessage = {
                method : "subscribeOrderbook",
                id : this.requestId++,
                params : {
                    symbol : productId
                }
            };
            const subscribeTradebookMessage:TradesubscriptionRequestMessage = {
                method : "subscribeTrades",
                id : this.requestId++,
                params : {
                    limit : 100,
                    symbol : productId
                }
            };
            this.send(JSON.stringify(subscribeOrderbookMessage));
            this.send(JSON.stringify(subscribeTradebookMessage));
        });
        return true;
    }

    protected onOpen(): void {
        // Nothing for now
    }

    protected handleMessage(rawMsg: string): void {
        const msg:any = JSON.parse(rawMsg) as HitbtcMessage;
        switch(msg.method) {
            case "snapshotOrderbook":
                this.handleSnapshot(msg);
                break;
            case "updateOrderbook":
                this.handleOrderbookUpdate(msg);
                break;
            case "snapshotTrades":
            case "updateTrades":
                this.handleTrade(msg);
                break;
        }

    }


    private handleSnapshot(snapshot: OrderbookResponseMessage) {
        // (re)initialize our order id map
        let sequence = snapshot.params.sequence;
        let exchangeSymbol = snapshot.params.symbol;
        let genericProduct = HitbtcMarketFeed.genericProduct(exchangeSymbol);
        this.setSnapshotSequence(genericProduct, sequence);
        var asks : PriceLevelWithOrders[] = snapshot.params.ask.map((info)=> {
            return PriceLevelFactory(parseFloat(info.price), parseFloat(info.size), 'sell')
        })
        var bids : PriceLevelWithOrders[] = snapshot.params.bid.map((info)=> {
            return PriceLevelFactory(parseFloat(info.price), parseFloat(info.size), 'buy')
        })

        const snapshotMsg: SnapshotMessage = {
            time: new Date(snapshot.params.timestamp),
            sequence: sequence,
            type: 'snapshot',
            productId: genericProduct,
            asks,
            bids,
            orderPool : null
        };

        this.push(snapshotMsg);
    }

    private handleOrderbookUpdate(updates: OrderbookResponseMessage) {
        let sequence = updates.params.sequence;
        let exchangeSymbol = updates.params.symbol;
        let genericProduct = HitbtcMarketFeed.genericProduct(updates.params.symbol);
        const seq = this.nextSequence(genericProduct);

        updates.params.ask.map((info)=> {
            const message: LevelMessage = {
                time: new Date(updates.params.timestamp),
                sequence: sequence,
                type: 'level',
                productId : genericProduct,
                price: (info.price).toString(),
                size: info.size ? info.size.toString() : '0',
                side: 'sell',
                count: 1,
            };
            this.push(message);
        });
        updates.params.bid.map((info)=> {
            const message: LevelMessage = {
                time: new Date(updates.params.timestamp),
                sequence: sequence,
                type: 'level',
                productId : genericProduct,
                price: (info.price).toString(),
                size: info.size ? info.size.toString() : '0',
                side: 'buy',
                count: 1,
            };
            this.push(message);
        });
    }

    private handleTrade(trades: TradesubscriptionResponseMessage) {
        trades.params.data.forEach((trade: HitbtcTradeMessage) => {
            const message: TradeMessage = {
                type: 'trade',
                productId: HitbtcMarketFeed.genericProduct(trades.params.symbol),
                time: new Date(trade.timestamp),
                tradeId: trade.id.toString(),
                price: trade.price.toString(),
                size: trade.quantity.toString(),
                side: trade.side.toLowerCase(),
            };
            this.push(message);
        });
    }
}
