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
    private MAX_QUEUE_LENGTH: number = 5000;
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
        console.log('Setting up heart beat checker for depth and trade every 0.4 minutes');
        console.log('=============================================');
        setInterval(()=> {
            var now = Date.now();
            console.log('Verifying depth and trade socket status and testing ping  ', now);
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
                    console.log('Product                    : ', product)
                    console.log('Last pong times            : ', tradePong, depthPong )
                    console.log('Last trade & depth times   : ', lastTraded, lastReceived )
                    console.log('Elapsed                    : ', elapsed / 1000 , 'secs')
                    console.log('Trade Elapsed              : ', tradeElapsed / 1000 , 'secs')
                    if((!tradePonged) || (!depthPonged) || (tradeSocket.readyState > 1) || (depthSocket.readyState > 1) || tradeElapsed > (1000 * 60 * 10) || (elapsed) > (1000 * 60 * 5)) {
                        console.log((!tradePonged) , (!depthPonged) , (tradeSocket.readyState > 1) , (depthSocket.readyState > 1) , tradeElapsed > (1000 * 60 * 10) , (elapsed) > (1000 * 60 * 5))
                        failed = true;
                        console.log('Socket not working for product ', product)
                        this.subscribeProduct(product);
                    } else {
                        console.log('Socket good for product ', product)
                    }
                } catch(err) {
                    console.error(err);
                }
            })
        }, 1000 * 60 * 4)
    }

    async subscribeProduct(product:string) {
        try {
            if(underBan) {
                console.warn('Under ban not subscribing product', product)
                return;
            }
            index++;
            if(index % 3 === 0) {
                await new Promise((resolve)=> setTimeout(resolve, 15000));
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
            depthSocket.on('pong', (data:any)=> {
                (depthSocket as any).lastPongTime = parseInt(data.toString())
            })
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
            tradesocket.on('open', ()=> {
                tradesocket.ping(Date.now());
            })
            this.tradesockets[product] = tradesocket;
            this.depthsockets[product] = depthSocket;
            (depthSocket as any).lastPongTime = initialTime;
            (tradesocket as any).lastPongTime = initialTime;

            request(`https://www.binance.com/api/v1/depth?symbol=${product.toUpperCase()}&limit=1000`, { json : true }).then((depthSnapshot) => {
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
