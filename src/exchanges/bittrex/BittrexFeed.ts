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
import * as Bittrex from 'node-bittrex-api';
import { LevelMessage, SnapshotMessage, TickerMessage, TradeMessage } from '../../core/Messages';
import { BittrexAPI } from './BittrexAPI';
import { Big } from '../../lib/types';
import { OrderPool } from '../../lib/BookBuilder';
import { Level3Order, PriceLevelWithOrders } from '../../lib/Orderbook';

var wait = async function(time:number) {
    return new Promise((resolve, reject)=> {
        setTimeout(resolve, time)
    });
}

var retryCount = process.env.RETRY_COUNT || 1;

export class BittrexFeed extends ExchangeFeed {
    private client: any;
    private connection: any;
    private counters: { [product: string]: MessageCounter };
    private erroredProducts: Set<string> = new Set<string>();

    constructor(config: ExchangeFeedConfig) {
        super(config);
        const auth = config.auth || { key: 'APIKEY', secret: 'APISECRET' };
        this.url = config.wsUrl || 'wss://socket.bittrex.com/signalr';
        this.counters = {};
        Bittrex.options({
            websockets_baseurl: this.url,
            apikey: auth.key,
            apisecret: auth.secret,
            inverse_callback_arguments: true,
            stream: false,
            cleartext: false,
            verbose: true
        });
        this.connect();
    }

    get owner(): string {
        return 'Bittrex';
    }

    async subscribe(products: string[]): Promise<boolean> {
        if (!this.connection) {
            return false;
        }
        let index = 1;
        console.log('Subscribe started @ ', new Date())
        for (let product of products) {
            await wait(300);
            this.log('info', `Subscribing product ${product} at ${index} of ${products.length}`)
            index++;
            await new Promise((resolve, reject) => {
                this.client.call('CoreHub', 'SubscribeToExchangeDeltas', product).done((err: Error, result: boolean) => {
                    if (err) {
                        this.erroredProducts.add(product)
                        console.log('Error occured');
                        resolve(false)
                        return console.error(err);
                    }
                    if (result === true) {
                        this.log('info', `Subscribed to ${product} on ${this.owner}, requesting snaphsot.`);
                        this.client.call('CoreHub', 'queryExchangeState', product).done((err: Error, data: any) => {
                            this.log('info', `Snapshot received for ${product} on ${this.owner}`);
                            const snapshot: SnapshotMessage = this.processSnapshot(product, data);
                            if(snapshot !== null) {
                                this.push(snapshot);
                            }else {
                                this.erroredProducts.add(product)
                                console.warn('Null received for snapshot for product ', product, 'raw message', data);
                            } 
                            resolve(true)
                        });
                    }
                });
            });
        }
        if(this.erroredProducts.size > 0) {
            console.log(`${this.erroredProducts.size} products errored retrying ....`);
            if(retryCount > 0) {
                retryCount--;
                this.subscribe(Array.from(this.erroredProducts));
            } else {
                console.log('No more retry available');
                console.log('could not subscribe following products ', Array.from(this.erroredProducts))    
            };
            this.erroredProducts.clear();
        } else {
            console.log('All products subscribed');
            console.log('Subscribe completed @ ', new Date())
        }
        return true;
    }

    protected async connect() {
        Bittrex.websockets.client((client:any) => {
            this.client = client;
            client.serviceHandlers.messageReceived = (msg: any) => this.handleMessage(msg);
            client.serviceHandlers.bound = () => this.onNewConnection();
            client.serviceHandlers.disconnected = (code: number, reason: string) => this.onClose(code, reason);
            client.serviceHandlers.onerror = (err: Error) => this.onError(err);
            client.serviceHandlers.connected = (connection: any) => {
                this.connection = connection;
                this.emit('websocket-connection');
            };
        });
    }

    protected handleMessage(msg: any): void {
        if (msg.type !== 'utf8' || !msg.utf8Data) {
            return;
        }
        let data;
        try {
            data = JSON.parse(msg.utf8Data);
        } catch (err) {
            this.log('debug', 'Error parsing feed message', msg.utf8Data);
            return;
        }
        if (!Array.isArray(data.M)) {
            return;
        }
        this.confirmAlive();
        data.M.forEach((message: any) => {
            this.processMessage(message);
        });
    }

    protected onOpen(): void {
        // no-op
    }

    protected onClose(code: number, reason: string): void {
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

    private processMessage(message: any) {
        switch (message.M) {
            case 'updateExchangeState':
                this.updateExchangeState(message.A as BittrexExchangeState[]);
                break;
            case 'updateSummaryState':
                const tickers: BittrexTicker[] = message.A[0].Deltas || [];
                this.updateTickers(tickers);
                break;
            default:
                this.log('debug', `Unknown message type: ${message.M}`);
        }
    }

    private updateExchangeState(states: BittrexExchangeState[]) {

        const createUpdateMessage = (genericProduct: string, side: string, nonce: number, delta: BittrexOrder): LevelMessage => {
            const seq = this.nextSequence(genericProduct);
            const message: LevelMessage = {
                type: 'level',
                time: new Date(),
                sequence: seq,
                sourceSequence: nonce,
                productId: genericProduct,
                side: side,
                price: delta.Rate,
                size: delta.Quantity,
                count: 1
            };
            return message;
        };

        states.forEach((state: BittrexExchangeState) => {
            const product = state.MarketName;
            let genericProduct = BittrexAPI.genericProduct(product);
            const snaphotSeq = this.getSnapshotSequence(genericProduct);
            if (state.Nounce <= snaphotSeq) {
                return;
            }
            state.Buys.forEach((delta: BittrexOrder) => {
                const msg: LevelMessage = createUpdateMessage(genericProduct, 'buy', state.Nounce, delta);
                this.push(msg);
            });
            state.Sells.forEach((delta: BittrexOrder) => {
                const msg: LevelMessage = createUpdateMessage(genericProduct, 'sell', state.Nounce, delta);
                this.push(msg);
            });
            state.Fills.forEach((fill: BittrexFill) => {
                const message: TradeMessage = {
                    type: 'trade',
                    productId: genericProduct,
                    time: new Date(fill.TimeStamp),
                    tradeId: '0',
                    price: fill.Rate,
                    size: fill.Quantity,
                    side: fill.OrderType.toLowerCase()
                };
                this.push(message);
            });
        });
    }

    private updateTickers(tickers: BittrexTicker[]) {
        tickers.forEach((bittrexTicker: BittrexTicker) => {
            const ticker: TickerMessage = {
                type: 'ticker',
                productId: BittrexAPI.genericProduct(bittrexTicker.MarketName),
                bid: Big(bittrexTicker.Bid),
                ask: Big(bittrexTicker.Ask),
                time: new Date(bittrexTicker.TimeStamp),
                price: Big(bittrexTicker.Last),
                volume: Big(bittrexTicker.Volume)
            };
            this.push(ticker);
        });
    }

    private processSnapshot(product: string, state: BittrexExchangeState): SnapshotMessage {
        try {
            if(state) {
                let genericProduct = BittrexAPI.genericProduct(product);
                const orders: OrderPool = {};
                const snapshotMessage: SnapshotMessage = {
                    type: 'snapshot',
                    time: new Date(),
                    productId: genericProduct,
                    sequence: state.Nounce,
                    asks: [],
                    bids: [],
                    orderPool: orders
                };
                state.Buys.forEach((order: BittrexOrder) => {
                    addOrder(order, 'buy', snapshotMessage.bids);
                });
                state.Sells.forEach((order: BittrexOrder) => {
                    addOrder(order, 'sell', snapshotMessage.asks);
                });
                this.setSnapshotSequence(genericProduct, state.Nounce);
                return snapshotMessage;
        
                function addOrder(order: BittrexOrder, side: string, levelArray: PriceLevelWithOrders[]) {
                    const size = Big(order.Quantity);
                    const newOrder: Level3Order = {
                        id: String(order.Rate),
                        price: Big(order.Rate),
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
            return null;
        }
    }
}

interface MessageCounter {
    base: number;
    offset: number;
}

interface BittrexFill {
    OrderType: string;
    Rate: string;
    Quantity: string;
    TimeStamp: string;
}

interface BittrexOrder {
    Rate: string;
    Quantity: string;
    Type: number;
}

interface BittrexExchangeState {
    MarketName: string;
    Nounce: number;
    Buys: any[];
    Sells: any[];
    Fills: any[];
}

interface BittrexTicker {
    MarketName: string;
    High: number;
    Low: number;
    Volume: number;
    Last: number;
    BaseVolume: number;
    TimeStamp: string;
    Bid: number;
    Ask: number;
    OpenBuyOrders: number;
    OpenSellOrders: number;
    PrevDay: number;
    Created: string;
}
