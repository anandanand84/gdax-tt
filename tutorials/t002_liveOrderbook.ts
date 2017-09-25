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

import * as GTT from '..';
import { ProductMap } from '../build/src/exchanges/ProductMap';
import { GDAXFeed } from "../build/src/exchanges";
import { LiveBookConfig, LiveOrderbook, SkippedMessageEvent, TradeMessage } from "../build/src/core";
import { Ticker } from "../build/src/exchanges/PublicExchangeAPI";

var express:any = require('express');
var app:any = express();
var server:any = require('http').Server(app);
var io:any = require('socket.io')(server);
io.set('transports', ['websocket']);

import { Writable } from 'stream'

let orderBooks = new Map<string, LiveOrderbook>();

io.of('/quotes').on('connection', function(socket:any) {
    socket.on('snapshot', (product:any) => {
        let book = orderBooks.get(product);
        let state:any = book.state();
        //StreamMessage
        state.type = "snapshot";
        state.time = state.lastBookUpdate;
        //SnapshotMessage
        state.productId = product;
        io.of('/quotes').to(product).emit('snapshot', state);
    });
    socket.on('subscribe', function (product:string) {
        socket.join(product);
    });
    socket.on('unsubscribe', function (product:string) {
        socket.leave(product);
    });
      
});

class SocketStream extends Writable {
    write(msg: any, callback: any): boolean {
        if(msg.type === 'snapshot') {
            io.of('/quotes').to(msg.productId).emit('snapshot', msg);
            return true;
        }
        io.of('/quotes').to(msg.productId).emit('stream', msg);
        return true;
    }
}

server.listen(3250, function () {
    console.log('Server listening in 3250');
});

// const products = ['BTC/USDT'];
const logger = GTT.utils.ConsoleLoggerFactory({ level: 'debug' });
// const printOrderbook = GTT.utils.printOrderbook;
const printTicker = GTT.utils.printTicker;
/*
 Simple demo that sets up a live order book and then periodically prints some stats to the console.
 */

const EXCHANGE:string = process.env.Exchange || "Bittrex";

async function start() {
    let tradeVolume: number = 0;
    
    await ProductMap.configureExchange(EXCHANGE);
    let products = ['BTC/USDT', 'ETH/USDT', 'LTC/USDT']//await ProductMap.ExchangeMap.get(EXCHANGE).getAvailableProducts();
    // products = products.slice(1, 50);
    console.log('Total available products', products.length);
    
    let factories:any = GTT.Factories;
    let socketStream = new SocketStream();
    factories[EXCHANGE].FeedFactory(logger, products).then((feed: GDAXFeed) => {
    // Configure the live book object
        console.log('Feed started');
        let count = 1;
        products.forEach((product:any)=> {
            const config: LiveBookConfig = {
                product: product,
                logger: logger
            };
            const book = new LiveOrderbook(config);
            book.on('LiveOrderbook.snapshot', () => {
                // logger.log('info', 'Snapshot received by LiveOrderbook Demo for '+product);
            });
            book.on('LiveOrderbook.ticker', (ticker: Ticker) => {
                // console.log(printTicker(ticker));
            });
            book.on('LiveOrderbook.trade', (trade: TradeMessage) => {
                tradeVolume += +(trade.size);
            });
            book.on('LiveOrderbook.skippedMessage', (details: SkippedMessageEvent) => {
                // On GDAX, this event should never be emitted, but we put it here for completeness
                console.log('SKIPPED MESSAGE', details);
                console.log('Reconnecting to feed');
                feed.reconnect(0);
            });
            book.on('end', () => {
                console.log('Orderbook closed');
            });
            book.on('error', (err) => {
                console.log('Livebook errored: ', err);
                feed.pipe(book);
            });
            feed.pipe(book);
            orderBooks.set(product, book);
        })
        feed.pipe(socketStream);
    }).catch((err:any) => {
        logger.error(err);
    });
    
    // function printOrderbookStats(book: LiveOrderbook) {
    //     console.log("-----------SELL---------------------")
    //     book.book.state().asks.slice(0,5).reverse().forEach((level)=> {
    //         console.log(`${level.totalSize}\t${level.price}` );
    //     })

    //     console.log("-----------BUY---------------------")
    //     book.book.state().bids.slice(0,5).forEach((level)=> {
    //         console.log(`${level.totalSize}\t${level.price}` );
    //     })
    //     // console.log(`Number of bids:       \t${book.numBids}\tasks: ${book.numAsks}`);
    //     // console.log(`Total ${book.baseCurrency} liquidity: \t${book.bidsTotal.toFixed(3)}\tasks: ${book.asksTotal.toFixed(3)}`);
    //     // let orders: CumulativePriceLevel[] = book.ordersForValue('buy', 100, false);
    //     // console.log(`Cost of buying 100 ${book.baseCurrency}: ${orders[orders.length - 1].cumValue.toFixed(2)} ${book.quoteCurrency}`);
    //     // orders = book.ordersForValue('sell', 1000, true);
    //     // console.log(`Need to sell ${orders[orders.length - 1].cumSize.toFixed(3)} ${book.baseCurrency} to get 1000 ${book.quoteCurrency}`);
    // }
}

start();