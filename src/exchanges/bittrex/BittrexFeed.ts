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
import { LevelMessage, SnapshotMessage, TickerMessage, TradeMessage } from '../../core/Messages';
import { BittrexAPI } from './BittrexAPI';
import { Big } from '../../lib/types';
import { OrderPool } from '../../lib/BookBuilder';
import { Level3Order, PriceLevelWithOrders } from '../../lib/Orderbook';

const SignalRClient = require('bittrex-client-v2');
console.log("Using bittrex v2 api");

var wait = async function(time:number) {
    return new Promise((resolve, reject)=> {
        setTimeout(resolve, time)
    });
}

var retryCount = process.env.RETRY_COUNT || 1;

export class BittrexFeed extends ExchangeFeed {
    protected handleMessage(msg: string, product?: string): void {
        throw new Error("Method not implemented.");
    }
    private client: any;
    private connection: any;
    private counters: { [product: string]: MessageCounter };
    private erroredProducts: Set<string> = new Set<string>();

    constructor(config: ExchangeFeedConfig) {
        super(config);
        this.counters = {};
        this.connect();
    }

    get owner(): string {
        return 'Bittrex';
    }

    async subscribe(products: string[]): Promise<boolean> {
        let index = 1;
        console.log('Subscribe started @ ', new Date())
        for (let product of products) {
            try {
                await wait(300);
                this.log('info', `Subscribing product ${product} at ${index} of ${products.length}`)
                index++;
                console.log(product);
                this.client.subscribeToMarkets([product]); //USDT-BTC
            } catch(err) {
                this.erroredProducts.add(product);
            }
        }
        if(this.erroredProducts.size > 0) {
            console.log(`${this.erroredProducts.size} products errored retrying ....`);
            if(retryCount > 0) {
                retryCount--;
                var productsToRetry = Array.from(this.erroredProducts);
                this.erroredProducts.clear();
                this.subscribe(productsToRetry);
            } else {
                console.log('No more retry available');
                console.log('could not subscribe following products ', Array.from(this.erroredProducts))    
            };
        } else {
            console.log('All products subscribed');
            console.log('Subscribe completed @ ', new Date())
        }
        return true;
    }

    protected async connect() {
        try {
            this.client = new SignalRClient({
                pingTimeout:20000,
                watchdog:{
                    markets:{
                        timeout:900000,
                        reconnect:true
                    }
                },
                useCloudScraper:true
            });
            this.client.on('orderBook', (data:any) =>{
                var snapshot = this.processSnapshot(data.pair, data);
                this.push(snapshot);
            });
            this.client.on('orderBookUpdate', (data:any) =>{
                this.updateLevel(data);
            });
            this.client.on('trades', (data: BittrexFill) =>{
                this.processTradeMessage(data);
            });
            console.log('Connected to signal r');
        } catch(err) {
            console.error(err);
        }
    }

    protected onOpen(): void {
        // no-op
    }

    protected onClose(code: number, reason: string): void {
        console.log('Websocket connectFailed');
        this.emit('websocket-closed');
        this.connection = null;
    }

    protected close() {
        this.client.end();
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

    private processTradeMessage(data:BittrexFill) {
        let genericProduct = BittrexAPI.genericProduct(data.pair);
        data.data.forEach(info => {
            const message: TradeMessage = {
                type: 'trade',
                productId: genericProduct,
                time: new Date(info.timestamp * 1000),
                tradeId: info.id.toString(), 
                price: info.rate.toString(),
                size: info.quantity.toString(),
                side: info.orderType.toLowerCase()
            };
            this.push(message);       
        });;
    }

    private updateLevel(states: BittrexExchangeState) {
        const createUpdateMessage = (genericProduct: string, side: string, nonce: number, delta: BittrexOrder): LevelMessage => {
            const seq = this.nextSequence(genericProduct);
            const message: LevelMessage = {
                type: 'level',
                time: new Date(),
                sequence: seq,
                sourceSequence: nonce,
                productId: genericProduct,
                side: side,
                price: delta.rate.toString(),
                size: delta.action === 'remove' ? '0' : delta.quantity.toString(),
                count: 1
            };
            return message;
        };

        const product = states.pair;
        let genericProduct = BittrexAPI.genericProduct(product);
        const snaphotSeq = this.getSnapshotSequence(genericProduct);
        if (states.cseq <= snaphotSeq) {
            return;
        }
        states.data.buy.forEach((delta: BittrexOrder) => {
            const msg: LevelMessage = createUpdateMessage(genericProduct, 'buy', states.cseq, delta);
            this.push(msg);
        });
        states.data.sell.forEach((delta: BittrexOrder) => {
            const msg: LevelMessage = createUpdateMessage(genericProduct, 'sell', states.cseq, delta);
            this.push(msg);
        });
    }

    private processSnapshot(product: string, state: BittrexExchangeState): SnapshotMessage {
        try {
            if(state && state.data) {
                let genericProduct = BittrexAPI.genericProduct(state.pair);
                const orders: OrderPool = {};
                const snapshotMessage: SnapshotMessage = {
                    type: 'snapshot',
                    time: new Date(),
                    productId: genericProduct,
                    sequence: state.cseq,
                    asks: [],
                    bids: [],
                    orderPool: orders
                };
                state.data.buy.forEach((order: BittrexOrder) => {
                    addOrder(order, 'buy', snapshotMessage.bids);
                });
                state.data.sell.forEach((order: BittrexOrder) => {
                    addOrder(order, 'sell', snapshotMessage.asks);
                });
                this.setSnapshotSequence(genericProduct, state.cseq);
                return snapshotMessage;
        
                function addOrder(order: BittrexOrder, side: string, levelArray: PriceLevelWithOrders[]) {
                    const size = Big(order.quantity);
                    const newOrder: Level3Order = {
                        id: String(order.rate),
                        price: Big(order.rate),
                        size: size,
                        side: side
                    };
                    const newLevel: PriceLevelWithOrders = {
                        price: newOrder.price,
                        totalSize: size,
                        orders: [newOrder]
                    };
                    levelArray.push(newLevel);
                }
            }
            return null;
        }catch(err) {
            console.log('Failed to process snapshot for ', product);
            console.error(err)
            return null;
        }
    }
}

interface MessageCounter {
    base: number;
    offset: number;
}

interface BittrexFill {
    pair : string
    data : [{
        id: number,
        quantity: number,
        rate: number,
        orderType: string,
        timestamp: number
    }]
}

interface BittrexOrder {
    action?:string
    rate: number;
    quantity: number;
}

interface BittrexExchangeState {
    pair: string;
    cseq: number;
    data : {
        buy: BittrexOrder[];
        sell: BittrexOrder[];
    }
}
