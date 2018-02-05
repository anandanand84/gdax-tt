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
import { BinanceAPI } from './BinanceAPI';
import { ProductMap } from '../';
import { ExchangeFeed } from '../ExchangeFeed';
import { SnapshotMessage, LevelMessage, TradeMessage, StreamMessage } from '../../core/Messages';
import { OrderPool } from '../../lib/BookBuilder';
import { Level3Order, PriceLevelWithOrders } from '../../lib/Orderbook';
import { Big } from '../../lib/types';
import WebSocket = require('ws');
import * as request from 'request-promise';
import * as GI from './BinanceInterfaces';
import { BinanceMessage, BinanceSnapshotMessage, BinanceTradeMessage, BinanceDepthMessage } from './BinanceInterfaces';

export const BINANCE_WS_FEED = `wss://stream.binance.com:9443/ws/`;

// hooks for replacing libraries if desired
const hooks = {
    WebSocket: WebSocket
};

interface MessageCounter {
    base: number;
    offset: number;
}


var retryCount = process.env.RETRY_COUNT || 1;

export class BinanceFeed extends ExchangeFeed {
    readonly owner: string;
    readonly feedUrl: string;
    protected lastHeartBeat: number = -1;
    private totalMessageCount: { [product:string] : number } = {}
    private lastMessageTime: { [product:string] : number } = {}
    private lastTradeTime: { [product:string] : number } = {}
    private totalMessageInterval: { [product:string] : number } = {}
    private counters: { [product: string]: number } = {};
    private sequences : { [product: string]: number } = {};
    protected initialMessagesQueue: { [product: string]: BinanceMessage[] } = {};
    protected depthsockets:  { [product: string]: WebSocket } = {};
    protected tradesockets:  { [product: string]: WebSocket } = {};
    private MAX_QUEUE_LENGTH: number = 1000;
    private erroredProducts: Set<string> = new Set<string>();

    constructor(config: GI.BinanceFeedConfig) {
        super(config);
        this.owner = 'Binance';
        this.multiSocket = true;
        this.feedUrl = BINANCE_WS_FEED;
        this.connect(config.products);
    }

    protected getWebsocketUrlForProduct(product:string):string {
        return BINANCE_WS_FEED+product.toLowerCase()+'@depth';
    }

    protected async connect(products?:string[]) {
        console.log('Is multi sockets : ',this.multiSocket)
        console.log('Products list : ',products)
        if (this.isConnecting || this.isConnected()) {
            return;
        }
        this.isConnecting = true;
        var index = 0;
        setTimeout(()=> {
            this.emit('websocket-connection');
        },3000)
        if(this.multiSocket && products && products.length > 0) {
            for(let product of products) {
                index++;
                this.counters[product] = -1;
                this.totalMessageInterval[product] = 0;
                this.totalMessageCount[product] = 0;
                this.lastMessageTime[product] = 0;
                this.initialMessagesQueue[product] = [];
                if(index % 5 === 0) {
                    await new Promise((resolve)=> setTimeout(resolve, 10000));
                }
                await this.subscribeProduct(product);
            }
            if(this.erroredProducts.size > 0) {
                console.log('=========================================================================');
                console.log('could not subscribe following products ', Array.from(this.erroredProducts))    
                console.log('=========================================================================');
            } else {
                console.log('=========================================================================');
                console.log('All products subscribed');
                console.log('Subscribe completed @ ', new Date())
                console.log('=========================================================================');
            }
        }
        console.log('=============================================');
        console.log('Setting up heart beat checker for depth and trade');
        console.log('=============================================');
        setInterval(()=> {
            var now = Date.now();
            console.log('Verifying depth and trade socket status  ', now);
            Object.keys(this.lastMessageTime).forEach((product)=> {
                var failed = false;
                var lastReceived = this.lastMessageTime[product];
                var lastTraded = this.lastTradeTime[product];
                var elapsed = now - lastReceived;
                var tradeElapsed = now - lastTraded;
                var count = this.totalMessageCount[product];
                var averageTimeTaken = this.totalMessageInterval[product] / count ;
                console.log('Product : ', product)
                console.log('Elapsed : ', elapsed / 1000 , 'secs')
                console.log('Average time taken : ', averageTimeTaken / 1000, ' secs ')
                console.log('Total Mesages  : ', count)
                if(tradeElapsed > (1000 * 60 * 1)) {
                    console.warn(product, 'Trade Elapsed time greater than 1 minutes', elapsed / 1000);
                    if(tradeElapsed > (50 * averageTimeTaken)) {
                        failed = true;
                    }
                }
                if((elapsed) > (1000 * 60 * 1)) {
                    console.warn(product, ' Elapsed time greater than 1 minutes', elapsed / 1000);
                    console.warn(product ,' Average time taken for messages in secs', averageTimeTaken / 1000);
                    let fiftyTimesAverage = (50 * averageTimeTaken);
                    let maxTime = 1000 * 60 * 5
                    let availableTime = fiftyTimesAverage > 50000 ?  maxTime : fiftyTimesAverage;
                    if(elapsed > fiftyTimesAverage ) {
                        console.error(product ,' Resubscribing ',elapsed, averageTimeTaken);
                        failed = true;
                    }
                }
                if(failed) {
                    this.subscribeProduct(product);
                }
            })
        }, 1000 * 60 * 0.4)
    }

    async subscribeProduct(product:string) {
        try {
            var oldTradeSocket:WebSocket = this.tradesockets[product];
            var oldDepthSocket:WebSocket = this.depthsockets[product];
            if(oldTradeSocket) {
                (oldTradeSocket as any).active = false;
                (oldTradeSocket as any).close()
            }
            if(oldDepthSocket) {
                (oldDepthSocket as any).active = false;
                oldDepthSocket.close()
            }
            this.totalMessageInterval[product] = 0;
            this.totalMessageCount[product] = 0;
            this.lastMessageTime[product] = 0;
            this.lastTradeTime[product] = 0;
            var depthUrl = this.getWebsocketUrlForProduct(product);
            console.log('connecting to ',this.getWebsocketUrlForProduct(product))
            const depthSocket = new hooks.WebSocket(depthUrl);
            depthSocket.on('message', (msg: any) => {
                this.totalMessageCount[product] = this.totalMessageCount[product] + 1;
                if(this.lastMessageTime[product] === 0) {
                    this.lastMessageTime[product] = Date.now();
                } else {
                    var now = Date.now();
                    var interval = now - this.lastMessageTime[product];
                    this.lastMessageTime[product] = now;
                    this.totalMessageInterval[product] = this.totalMessageInterval[product] + interval;
                }
                this.handleDepthMessages(msg, product)
            });
            depthSocket.on('close', (data:any)=> {
                if((depthSocket as any).active) {
                    console.log('Active Depth socket closed resubscribing',product, data)
                    this.subscribeProduct(product)
                }else {
                    console.log('Inactive Depth socket closed ignoring',product,  data)
                }
            });
            depthSocket.on('error', (data:any)=> {
                if((depthSocket as any).active) {
                    console.log('Active Depth socket errored resubscribing',product, data)
                    this.subscribeProduct(product)
                } else {
                    console.log('Inactive Depth socket errored ignoring',product,  data)
                }
            });
            const tradesocket = new hooks.WebSocket(BINANCE_WS_FEED+product.toLowerCase()+'@trade');
            console.log('connecting to ', BINANCE_WS_FEED+product.toLowerCase()+'@trade')
            tradesocket.on('message', (msg: any) => {
                this.lastTradeTime[product] = Date.now();
                this.handleTradeMessages(msg, product)
            });
            tradesocket.on('close', (data:any)=> {
                if((depthSocket as any).active) {
                    console.log('Active Trade socket closed resubscribing',product, data)
                    this.subscribeProduct(product)
                } else {
                    console.log('Inactive Trade socket closed ignoring',product,  data)
                }
            });
            tradesocket.on('error', (data:any)=> {
                if((depthSocket as any).active) {
                    console.log('Active Trade socket errored resubscribing',product, data)
                    this.subscribeProduct(product)
                } else {
                    console.log('Inactive Trade socket errored ignoring',product,  data)
                }
            });
            this.tradesockets[product] = tradesocket;
            this.depthsockets[product] = depthSocket;
            request(`https://www.binance.com/api/v1/depth?symbol=${product.toUpperCase()}&limit=1000`, { json : true }).then((depthSnapshot) => {
                this.handleSnapshotMessage(depthSnapshot, product);
            }).catch((err)=> {
                this.erroredProducts.add(product)
                console.error(err);
            })
        }catch(err) {
            this.erroredProducts.add(product)
            console.error(err);
        }
    }

    protected handleMessage() {

    }

    protected handleSnapshotMessage(msg:BinanceSnapshotMessage, productId?:string) : void {
        var binanceMessage:BinanceSnapshotMessage = msg;
        binanceMessage.s = productId
        this.counters[productId] = binanceMessage.lastUpdateId + 1;
        let message = this.createSnapshotMessage(binanceMessage);
        this.push(message);
    }

    protected handleTradeMessages(msg: string, productId?:string) : void {
        var binanceTradeMessage: BinanceTradeMessage = JSON.parse(msg);
        const message: TradeMessage = {
            type: 'trade',
            productId: BinanceAPI.genericProduct(binanceTradeMessage.s),
            time: new Date(+binanceTradeMessage.E),
            tradeId: binanceTradeMessage.t.toString(),
            price: binanceTradeMessage.p,
            size: binanceTradeMessage.q,
            side: binanceTradeMessage.m ? 'sell' : 'buy'
        };
        this.push(message);
    }
    
    protected handleDepthMessages(msg: string, productId?:string) : void {
        var binanceDepthMessage:BinanceDepthMessage = JSON.parse(msg);
        var messageQueue = this.initialMessagesQueue[productId];
        let counter = this.counters[productId];
        if(counter > -1) {
            //flush all the messages
            let message:BinanceDepthMessage = <BinanceDepthMessage>messageQueue.pop()
            while(message) {
                if(message.u <= (counter - 1)) {
                    message = <BinanceDepthMessage>messageQueue.pop();
                    continue;
                } else if(message.U <= counter && message.u >= counter) {
                    this.processLevelMessage(message);
                    this.counters[productId] = (message.u + 1);
                    counter = (message.u + 1);
                    message = <BinanceDepthMessage>messageQueue.pop();
                } else {
                    console.warn(`Queued message doenst match the request criteria for product ${productId} restarting`)
                    this.counters[productId] = -1;
                    counter = -1;
                    this.subscribeProduct(productId);
                    return;
                }
            }
            if(binanceDepthMessage.U > counter ) {
                console.warn(`Skipped message for product ${productId} restarting feed Expected : ${counter} got ${binanceDepthMessage.U}`);
                this.counters[productId] = -1;
                counter = -1;
                this.subscribeProduct(productId);
            } else {
                this.counters[productId] = (binanceDepthMessage.u + 1);
                counter = (binanceDepthMessage.u + 1);
                this.processLevelMessage(binanceDepthMessage);
            }
        } else if(this.initialMessagesQueue[productId].length > this.MAX_QUEUE_LENGTH) {
            this.initialMessagesQueue[productId] = [];
            console.warn('Max queue length reached restarting feed for ', productId);
            this.counters[productId] = -1;
            counter = -1;
            this.subscribeProduct(productId);
            return;
        } else {
            messageQueue.push(binanceDepthMessage);
        }
    }

    nextSequence(prodcutId:string) {
        var seq = this.sequences[prodcutId] + 1;
        this.sequences[prodcutId] = seq;
        return seq;
    }

    processLevelMessage(depthMessage:BinanceDepthMessage) {
        var genericProduct = BinanceAPI.genericProduct(depthMessage.s);
        depthMessage.b.forEach((level)=> {
            const seq = this.nextSequence(depthMessage.s)
            const message: LevelMessage = {
                type: 'level',
                productId: genericProduct,
                time: new Date(+depthMessage.E),
                price: level[0],
                size: level[1],
                sequence: seq,
                side: 'buy',
                count: 1
            };
            this.push(message)
        })
        depthMessage.a.forEach((level)=> {
            const seq = this.nextSequence(depthMessage.s)
            const message: LevelMessage = {
                type: 'level',
                productId: genericProduct,
                time: new Date(+depthMessage.E),
                price: level[0],
                size: level[1],
                sequence: seq,
                side: 'sell',
                count: 1
            };
            this.push(message)
        })
    }

    protected onOpen(): void {
        // Do nothing for now
    }

    private createSnapshotMessage(msg: GI.BinanceSnapshotMessage): SnapshotMessage {
        this.sequences[msg.s] = 0;
        const orders: OrderPool = {};
        const snapshotMessage: SnapshotMessage = {
            type: 'snapshot',
            time: new Date(),
            productId: BinanceAPI.genericProduct(msg.s),
            sequence: 0,
            sourceSequence : msg.lastUpdateId,
            asks: [],
            bids: [],
            orderPool: orders
        };
        msg.bids.forEach((level)=> {
            let price = level[0];
            let size = level[1];
            const newOrder: Level3Order = {
                id: price,
                price: Big(price),
                size: Big(size),
                side: 'buy'
            };
            const priceLevel: PriceLevelWithOrders = {
                price: Big(price),
                totalSize: Big(size),
                orders: [newOrder]
            };
            snapshotMessage.bids.push(priceLevel);
            orders[newOrder.id] = newOrder;
        })

        msg.asks.forEach((level)=> {
            let price = level[0];
            let size = level[1];
            const newOrder: Level3Order = {
                id: price,
                price: Big(price),
                size: Big(size),
                side: 'sell'
            };
            const priceLevel: PriceLevelWithOrders = {
                price: Big(price),
                totalSize: Big(size),
                orders: [newOrder]
            };
            snapshotMessage.asks.push(priceLevel);
            orders[newOrder.id] = newOrder;
        })
        
        return snapshotMessage;
    }
}
