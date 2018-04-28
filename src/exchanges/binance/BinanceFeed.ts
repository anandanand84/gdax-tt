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
import { setTimeout, clearInterval } from 'timers';

export const BINANCE_WS_FEED = `wss://stream.binance.com:9443/ws/`;

// hooks for replacing libraries if desired
const hooks = {
    WebSocket: WebSocket
};

interface MessageCounter {
    base: number;
    offset: number;
}


var startingTime = Date.now();

var index = 0;
var underBan = false;
var lastBanRef:any;
var banUntilTime = 0;

var getBanTime = function(str:string) {
    const regex = /IP banned until (\d*)./g;
    let m;
    var time = 0;
    while ((m = regex.exec(str)) !== null) {
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) {
            regex.lastIndex++;
        }
        
        // The result can be accessed through the `m`-variable.
        m.forEach((match, groupIndex) => {
            time = parseInt(match);
            banUntilTime = time;
        });
    }
    return time;
}


var retryCount = process.env.RETRY_COUNT || 1;

export class BinanceFeed extends ExchangeFeed {
    readonly owner: string;
    readonly feedUrl: string;
    protected lastHeartBeat: number = -1;
    private lastMessageTime: { [product:string] : number } = {}
    private lastTradeTime: { [product:string] : number } = {}
    private counters: { [product: string]: number } = {};
    private sequences : { [product: string]: number } = {};
    protected initialMessagesQueue: { [product: string]: BinanceMessage[] } = {};
    protected depthsockets:  { [product: string]: WebSocket } = {};
    protected tradesockets:  { [product: string]: WebSocket } = {};
    private MAX_QUEUE_LENGTH: number = 500;
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

    retryErroredProducts() {
        console.log(' Total Errored products ', this.erroredProducts.size);
        if(this.erroredProducts.size > 0) {
            Array.from(this.erroredProducts).forEach(this.subscribeProduct.bind(this));
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
    protected async connect(products?:string[]) {
        console.log('Is multi sockets : ',this.multiSocket)
        console.log('Products list : ',products)
        if (this.isConnecting || this.isConnected()) {
            return;
        }
        this.isConnecting = true;
        setTimeout(()=> {
            this.emit('websocket-connection');
        },3000)
        if(this.multiSocket && products && products.length > 0) {
            for(let product of products) {
                this.counters[product] = -1;
                this.lastMessageTime[product] = 0;
                this.initialMessagesQueue[product] = [];
                await this.subscribeProduct(product);
            }
            this.retryErroredProducts();
            startingTime = Date.now();
        }
        console.log('=============================================');
        console.log('Setting up heart beat checker for depth and trade every 0.4 minutes after 0.1 min');
        console.log('=============================================');
        setTimeout(() => {
            Object.keys(this.lastMessageTime).forEach((product)=> {
                var now = Date.now();
                var tradeSocket:WebSocket = this.tradesockets[product];
                var depthSocket:WebSocket = this.depthsockets[product];
                if((tradeSocket.readyState > 0) && (depthSocket.readyState > 0)) {
                    tradeSocket.ping(now);
                    depthSocket.ping(now);
                }
            })
            setInterval(()=> {
                var now = Date.now();
                console.log('Verifying depth and trade socket status and testing ping  @', now);
                Object.keys(this.lastMessageTime).forEach((product)=> {
                    try {
                        var failed = false;
                        var tradeSocket:WebSocket = this.tradesockets[product];
                        var depthSocket:WebSocket = this.depthsockets[product];
                        if((tradeSocket.readyState > 0) && (depthSocket.readyState > 0)) {
                            tradeSocket.ping(now);
                            depthSocket.ping(now);
                        }
                        var tradePong = (tradeSocket as any).lastPongTime;
                        var depthPong = (depthSocket as any).lastPongTime;
                        var tradePonged = tradePong > ( now - (3 * 60 * 1000))
                        var depthPonged = depthPong > ( now - (3 * 60 * 1000))
                        var lastReceived = this.lastMessageTime[product];
                        var lastTraded = this.lastTradeTime[product];
                        var elapsed = now - lastReceived;
                        var tradeElapsed = now - lastTraded;
                        if((!tradePonged) || (!depthPonged) || (tradeSocket.readyState > 1) || (depthSocket.readyState > 1) || tradeElapsed > (1000 * 60 * 10) || (elapsed) > (1000 * 60 * 5)) {
                            console.log('Product                    : ', product)
                            console.log('Current Time               : ', new Date())
                            console.log('Trade Ponged               : ', new Date(tradePong))
                            console.log('Depth Ponged               : ', new Date(depthPong))
                            console.log('Last trade times           : ', new Date(lastTraded) )
                            console.log('Last Deth changed          : ', new Date(lastReceived) )
                            console.log('Elapsed                    : ', elapsed / 1000 , 'secs')
                            console.log('Trade Elapsed              : ', tradeElapsed / 1000 , 'secs')
                            console.log(`
Trade Ponged                    : ${(!tradePonged)} 
Depth Ponged                    : ${(!depthPonged)} 
Trade Ready State               : ${(tradeSocket.readyState > 1)} 
Depth Ready State               : ${(depthSocket.readyState > 1) } 
Trade Elapsed Failed            : ${tradeElapsed > (1000 * 60 * 10)}
Depth Elapsed Failed            : ${(elapsed) > (1000 * 60 * 10)}
                            `)
                            failed = true;
                            console.log('Socket not working for product ', product)
                            this.subscribeProduct(product);
                        } 
                    } catch(err) {
                        console.error(err);
                    }
                })
            }, 1000 * 60 * 0.6)
        }, 1000 * 60 * 4)
    }

    async subscribeProduct(product:string) {
        try {
            if(underBan) {
                console.warn('Under ban not subscribing product', product)
                return;
            }
            index++;
            console.log(index);
            if(index % 3 === 0) {
                await new Promise((resolve)=> setTimeout(resolve, 10500));
            }
            var initialTime = Date.now();
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
            this.lastMessageTime[product] = initialTime;
            this.lastTradeTime[product] = initialTime;
            var depthUrl = this.getWebsocketUrlForProduct(product);
            console.log('connecting to ',this.getWebsocketUrlForProduct(product))
            const depthSocket = new hooks.WebSocket(depthUrl);
            (depthSocket as any).active = true;
            var resolved = false;
            depthSocket.on('message', (msg: any) => {
                this.lastMessageTime[product] = Date.now();
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
            
            var depthPromise = new Promise((resolve, reject)=> {
                var timeout = setTimeout(()=> {
                    reject('TIMEDOUT');
                }, 20000)
                depthSocket.on('pong', (data:any)=> {
                    if(!resolved) {
                        console.log('Received pong after connect for ', product);
                        clearTimeout(timeout);
                        resolved = true;
                        resolve(true);
                    }
                    (depthSocket as any).lastPongTime = parseInt(data.toString())
                });
            });
            
            depthSocket.on('open', ()=> {
                depthSocket.ping(Date.now());
            })
            const tradesocket = new hooks.WebSocket(BINANCE_WS_FEED+product.toLowerCase()+'@trade');
            console.log('connecting to ', BINANCE_WS_FEED+product.toLowerCase()+'@trade');
            (tradesocket as any).active = true;
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
            tradesocket.on('pong', (data:any)=> {
                (tradesocket as any).lastPongTime = parseInt(data.toString());
            })

            var tradePromise = new Promise((resolve, reject)=> {
                var timeout = setTimeout(()=> {
                    reject('TIMEDOUT');
                }, 20000)
                tradesocket.on('open', ()=> {
                    tradesocket.ping(Date.now());
                    clearTimeout(timeout);
                    resolve(true);
                })
            })
            this.tradesockets[product] = tradesocket;
            this.depthsockets[product] = depthSocket;
            (depthSocket as any).lastPongTime = initialTime;
            (tradesocket as any).lastPongTime = initialTime;
            console.log('Waiting for trade and depth socket to connect for  ', product)
            var result = await depthPromise;
            var result = await tradePromise;
            console.log('Connected to both trade and depth, fetching snaphsot for ', product)
            this.fetchSnapshotForProduct(product);
            
        }catch(err) {
            if(err === 'TIMEDOUT') {
                this.subscribeProduct(product);
                return;
            }
            console.warn('Error occured when subscribing for product ', product);
            this.erroredProducts.add(product)
            console.error(err);
        }
    }

    private fetchSnapshotForProduct(product:string) {
        request(`https://www.binance.com/api/v1/depth?symbol=${product.toUpperCase()}&limit=1000`, { json : true }).then((depthSnapshot) => {
                console.log ('Received Snapshot ', product);
                this.handleSnapshotMessage(depthSnapshot, product);
            }).catch((err)=> {
                if(err.statusCode == 418) {
                    underBan = true;
                    var currentTime = Date.now();
                    var ban = getBanTime(err.message);
                    console.log('Removing ban @ ', ban, ' after ', (ban -  currentTime)/ 1000 , 'secs');
                    clearTimeout(lastBanRef);
                    lastBanRef = setTimeout(()=> {
                        underBan = false;
                        this.retryErroredProducts();
                    }, (ban - currentTime))
                }else if (err.statusCode == 429) {
                    underBan = true;
                    clearTimeout(lastBanRef);
                    lastBanRef = setTimeout(()=> {
                        underBan = false;
                        console.log('Retry after 50 secs')
                        this.retryErroredProducts();
                    }, (30 * 1000))
                }
                this.erroredProducts.add(product)
                console.warn('Error occured when fetching snapshot for product ', product);
                console.warn(err.message);
                console.error(err);
            })
    }

    protected handleMessage() {

    }

    protected handleSnapshotMessage(msg:BinanceSnapshotMessage, productId?:string) : void {
        var binanceMessage:BinanceSnapshotMessage = msg;
        binanceMessage.s = productId;
        var feedData = <BinanceDepthMessage>this.initialMessagesQueue[productId][0];
        if(feedData && (feedData.U > binanceMessage.lastUpdateId)) {
            //Snaphshot still old;
            console.log(`Snapshot still old, earliest feed counter ${feedData.U}, snapshot counter ${binanceMessage.lastUpdateId}`)
            this.fetchSnapshotForProduct(productId);
            return;
        }
        this.counters[productId] = binanceMessage.lastUpdateId + 1;
        console.log('Snapshot received for product ', productId, ' last update ', binanceMessage.lastUpdateId)
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
        if(this.counters[productId] > -1) {
            //flush all the messages
            let message:BinanceDepthMessage = <BinanceDepthMessage>messageQueue.pop()
            while(message) {
                if(message.u <= (this.counters[productId] - 1)) {
                    message = <BinanceDepthMessage>messageQueue.pop();
                    continue;
                } else if(message.U <= this.counters[productId] && message.u >= this.counters[productId]) {
                    this.processLevelMessage(message);
                    this.counters[productId] = (message.u + 1);
                    message = <BinanceDepthMessage>messageQueue.pop();
                } else {
                    console.warn(`Queued message doenst match the request criteria for product ${productId} restarting`)
                    this.counters[productId] = -1;
                    this.subscribeProduct(productId);
                    return;
                }
            }
            if(binanceDepthMessage.U > this.counters[productId] ) {
                console.warn(`Skipped message for product ${productId} restarting feed Expected : ${this.counters[productId]} got ${binanceDepthMessage.U}`);
                this.counters[productId] = -1;
                this.subscribeProduct(productId);
            } else {
                this.counters[productId] = (binanceDepthMessage.u + 1);
                this.processLevelMessage(binanceDepthMessage);
            }
        } else if(this.initialMessagesQueue[productId].length > this.MAX_QUEUE_LENGTH) {
            this.initialMessagesQueue[productId] = [];
            console.warn('Max queue length reached restarting feed for ', productId);
            this.counters[productId] = -1;
            this.subscribeProduct(productId);
            return;
        } else {
            console.log("Havent received snapshot yet. Adding to queue for ", productId);
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
