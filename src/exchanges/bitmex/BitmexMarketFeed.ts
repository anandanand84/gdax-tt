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
import { BITMEX_WS_FEED } from './BitmexCommon';
import { Big } from '../../lib/types';
import { OrderPool } from '../../lib/BookBuilder';
import { Level3Order, PriceLevelFactory, PriceLevelWithOrders } from '../../lib/Orderbook';
import {
    BitmexMessage, OrderbookSnapshotMessage, OrderbookUpdateMessage, TradeMessage as BitmexTradeMessage,
    TradeData, SubscriptionResponseMessage, PriceData, LevelUpdate,
} from './BitmexInterfaces';
import { ProductMap } from '../ProductMap';


export class BitmexMarketFeed extends ExchangeFeed {
    readonly owner: string;
    readonly feedUrl: string;
    // Maps order IDs to the price that they exist at
    private orderIdMap: Map<string, { [orderId: number]: number }>;
    // BitMEX WSAPI doesn't include a sequence number, so we have to keep track if it ourselves and hope for the best.
    private seq: number;

    private productSequences: { [exchangeProduct :string] : number};

    static product(genericProduct: string) {
        return ProductMap.ExchangeMap.get('Bitmex').getExchangeProduct(genericProduct) || genericProduct;
    }

    static genericProduct(exchangeProduct: string) {
        return ProductMap.ExchangeMap.get('Bitmex').getGenericProduct(exchangeProduct) || exchangeProduct;
    }

    static getMarket(genericProduct: string) {
        return ProductMap.ExchangeMap.get('Bitmex').getMarket(genericProduct);
    }
    
    static getMarketForExchangeProduct(exchangeProduct: string) {
        return ProductMap.ExchangeMap.get('Bitmex').getMarket(BitmexMarketFeed.genericProduct(exchangeProduct));
    }

    constructor(config: ExchangeFeedConfig) {
        if (!config.wsUrl) {
            config.wsUrl = BITMEX_WS_FEED;
        }
        super(config);
        this.owner = 'BitMEX';
        this.feedUrl = config.wsUrl;
        this.seq = 0;
        this.connect();
        setInterval(()=> {
            this.ping();
        }, 25 * 1000)
    }

    public async subscribe(productIds: string[]) {
        this.productSequences = {};
        this.logger.log('debug', `Subscribing to the following symbols: ${JSON.stringify(productIds)}`);
        productIds.forEach((productId: string) => {
            this.productSequences[productId] = -1;
            const subscribeMessage = {
                op: 'subscribe',
                args: [`orderBookL2:${productId}`, `trade:${productId}`],
            };
            this.send(JSON.stringify(subscribeMessage));
        });
        return true;
    }

    protected onOpen(): void {
        // Nothing for now
    }

    protected handleMessage(rawMsg: string): void {
        const msg: BitmexMessage = JSON.parse(rawMsg) as BitmexMessage;

        if (msg.error) {
            const errMsg: ErrorMessage = {
                message: `Error while subscribing to symbols`,
            };

            this.push(errMsg);
        } else if (msg.table === 'trade') {
            // trade message
            const tradeMsg: BitmexTradeMessage = msg as BitmexTradeMessage;
            this.handleTrade(tradeMsg);
        } else if (msg.action) {
            if (msg.action === 'partial') {
                // orderbook snapshot
                const snapshotMsg = msg as OrderbookSnapshotMessage;
                this.handleSnapshot(snapshotMsg);
            } else {
                // orderbook update
                const updateMsg = msg as OrderbookUpdateMessage;
                this.handleOrderbookUpdate(updateMsg);
            }
        } else if (msg.success !== undefined) {
            // subscription response
            const subscriptionResMSg: SubscriptionResponseMessage = msg as SubscriptionResponseMessage;
            this.handleSubscriptionSuccess(subscriptionResMSg);
        } else if (msg.info) {
            // welcome message
            this.logger.log('debug', 'Received welcome message from BitMEX WS feed.');
        } else {
            // unhandled/unexpected message
            const unkMsg: any = {
                type: 'unknown',
                time: new Date(),
                origin: msg,
            };
            this.push(unkMsg);
        }
    }

    /**
     * Gets the next sequence number, incrementing it for the next time it's called.
     */
    private getSeq(): number {
        this.seq += 1;
        return this.seq;
    }

    private handleSnapshot(snapshot: OrderbookSnapshotMessage) {
        // (re)initialize our order id map
        const newIdMap = snapshot.data.reduce((acc, { id, price }) => ({...acc, [id]: price }), {});
        var orderIdMap = new Map();
        var exchangeSymbol = snapshot.data[0].symbol;
        this.orderIdMap = orderIdMap.set(exchangeSymbol, newIdMap);

        const mapLevelUpdates: (date: PriceData) => PriceLevelWithOrders =
            ({ id, price, size, side }) => PriceLevelFactory(price, size, side.toLowerCase());

        const asks: PriceLevelWithOrders[] = snapshot.data
            .filter( ({ side }) => side === 'Sell' )
            .map(mapLevelUpdates);
        const bids: PriceLevelWithOrders[] = snapshot.data
            .filter( ({ side }) => side === 'Buy' )
            .map(mapLevelUpdates);

        const priceDataToLvl3: (pd: PriceData) => Level3Order = ({ price, size, side, id }) => ({
            price: Big(price),
            size: Big(size),
            side: side.toLowerCase(),
            id: id.toString(),
        });

        const orderPool: OrderPool = snapshot.data.reduce((acc: OrderPool, pd: PriceData) => ({
            ...acc,
            [ pd.id.toString() ]: priceDataToLvl3(pd),
        }), {});
        this.productSequences[exchangeSymbol] = 0;
        const snapshotMsg: SnapshotMessage = {
            time: new Date(),
            sequence: 0,
            type: 'snapshot',
            productId: BitmexMarketFeed.genericProduct(exchangeSymbol),
            asks,
            bids,
            orderPool,
        };

        this.push(snapshotMsg);
    }

    nextSequence(exchangeSymbol:string) {
        this.productSequences[exchangeSymbol] = this.productSequences[exchangeSymbol]+1;
        return this.productSequences[exchangeSymbol]
    }

    private handleOrderbookUpdate(updates: OrderbookUpdateMessage) {
        updates.data.forEach((update: LevelUpdate) => {
            var orderMap = this.orderIdMap.get(update.symbol);
            if(!orderMap) return;
            const price: number = orderMap[update.id];
            if (update.price) {
                // insert
                this.orderIdMap.get(update.symbol)[update.id] = update.price;
            } else if (!update.size) {
                // delete
                delete this.orderIdMap.get(update.symbol)[update.id];
            }

            const message: LevelMessage = {
                time: new Date(),
                sequence: this.nextSequence(update.symbol),
                type: 'level',
                productId: BitmexMarketFeed.genericProduct(update.symbol),
                price: (price ? price : update.price).toString(),
                size: update.size ? update.size.toString() : '0',
                side: update.side.toLowerCase(),
                count: 1,
            };

            this.push(message);
        });
    }

    private handleTrade(trades: BitmexTradeMessage) {
        trades.data.forEach((trade: TradeData) => {
            const message: TradeMessage = {
                type: 'trade',
                productId: BitmexMarketFeed.genericProduct(trade.symbol),
                time: new Date(trade.timestamp),
                tradeId: trade.trdMatchID,
                price: trade.price.toString(),
                size: trade.size.toString(),
                side: trade.side.toLowerCase(),
            };

            this.push(message);
        });
    }

    private handleSubscriptionSuccess(successMsg: SubscriptionResponseMessage) {
        // TODO
    }
}
