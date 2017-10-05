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
import { TradeMessage } from '../src/core';
import { GDAXFeed } from '../src/exchanges/gdax/GDAXFeed';
import { SkippedMessageEvent } from '../src/core/LiveOrderbook';
import { Ticker } from '../src/exchanges/PublicExchangeAPI';
import { RedisBook, RedisBookConfig } from '../src/core/RedisBook';
import { Writable } from 'stream'
import { getRedisct, getEmitter } from '../src/core/RedisConnector'
import { getIntervalTimeStamp } from 'tlab-util';

var redisct = getRedisct();
var io = getEmitter();

const EXCHANGE:string = process.env.Exchange || "GDAX";

let orderBooks = new Map<string, RedisBook>();

class SocketStream extends Writable {
    write(msg: any, callback: any): boolean {
        msg.exchange = EXCHANGE;
        let room = `${msg.exchange}:${msg.productId}`;
        let orderBookRoom = `${room}:book`;
        let tickerRoom = `${room}:ticker`;
        let type = 'book';
        let toRoom = '';
        switch(msg.type) {
            case 'ticker':
                toRoom = tickerRoom;    
                type = 'ticker';
                break;
            case 'snapshot': 
                type = 'snapshot';
                toRoom = orderBookRoom;
                break;
            case 'trade':
                var ltt = new Date(msg.time).getTime();
                const ticker = {
                    type: 'trade',
                    ltt : ltt,
                    scrip : msg.productId,
                    exchange: msg.exchange,
                    ltp: msg.price,
                    volume: msg.size
                };
                io.of('/api/quotes').to(tickerRoom).emit('ticker', Object.assign({}, ticker, {productId : room}));
                var quote = {ts:getIntervalTimeStamp(ltt, 60, 0), o : msg.price, h : msg.price, l:msg.price, c:msg.price, v:msg.size, exchange:msg.exchange, scrip:msg.productId}
                redisct.saveQuotes(quote, getIntervalTimeStamp(ltt, 86400, 0));
            case 'level':
                toRoom = orderBookRoom;
                type ='book';
                break;
        }
        io.of('/api/quotes').to(toRoom).emit(type, Object.assign({}, msg, {productId : room}));
        return true;
    }
}

const logger = GTT.utils.ConsoleLoggerFactory({ level: 'debug' });

async function start() {
    let tradeVolume: number = 0;
    console.log('Configuring Exchange ', EXCHANGE);
    await GTT.Exchanges.ProductMap.configureExchange(EXCHANGE);
    let products = await GTT.Exchanges.ProductMap.ExchangeMap.get(EXCHANGE).getAvailableProducts();
    console.log('Total available products', products.length);
    
    let factories:any = GTT.Factories;
    let socketStream = new SocketStream();
    factories[EXCHANGE].FeedFactory(logger, products).then((feed: GDAXFeed) => {
    // Configure the live book object
        console.log('Feed started for exchange ', EXCHANGE);
        products.forEach((product:any)=> {
            const config: RedisBookConfig = {
                product: product,
                logger: logger,
                exchange : EXCHANGE,
            };
            const book = new RedisBook(config);
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
}

start();