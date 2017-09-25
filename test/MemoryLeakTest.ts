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
import { Ticker } from '../build/src/exchanges/PublicExchangeAPI';
import { ProductMap } from '../build/src/exchanges/ProductMap';
import { LiveBookConfig, LiveOrderbook, SkippedMessageEvent, TradeMessage } from "../build/src/core";

import { Readable } from 'stream';

let snapshot = require('./snapshot.json');
let levels = require('./levelchange.json');
class MockFeed extends Readable {
    snapshotRead : boolean = false;
    lastLevelMessage : number = 0;
    lastSentSequence : number = 0;
    constructor(private messageCount:number) {
        super({ objectMode: true, highWaterMark: 1024 });
    }
    reset() {
        this.snapshotRead = false;
        this.lastLevelMessage = 0;
        this.lastSentSequence = 0;
    }
    _read(): boolean {
        if(this.lastSentSequence > this.messageCount) {
            return false;
        }
        process.nextTick(()=> {
            if(!this.snapshotRead) {
                this.push(snapshot);
                this.lastSentSequence = snapshot.sequence;
                this.snapshotRead = true;
            }
            else {
                if(this.lastLevelMessage >= levels.length) {
                    this.lastLevelMessage = 0;
                    // console.log(`Used memory in MB : ${process.memoryUsage().heapUsed / (1000 * 1000)} \r`);
                    process.stdout.write(`Used memory @ ${this.lastSentSequence} in MB : ${process.memoryUsage().heapUsed / (1000 * 1000)} \r`);
    
                }
                let levelMessage = levels[this.lastLevelMessage];
                let currentSequnce = ++this.lastSentSequence;
                levelMessage.sequence = currentSequnce;
                levelMessage.sourceSequence = currentSequnce;
                this.push(levelMessage)
                this.lastLevelMessage++;
            }
        });
        return true;
    }
}

const products = ['BTC/USDT'];
const logger = GTT.utils.ConsoleLoggerFactory({ level: 'debug' });
// const printOrderbook = GTT.utils.printOrderbook;
const printTicker = GTT.utils.printTicker;
/*
 Simple demo that sets up a live order book and then periodically prints some stats to the console.
 */

const EXCHANGE:string = process.env.Exchange || "Bittrex";

async function start() {
    let feed = new MockFeed(Infinity);
    let tradeVolume: number = 0;
    await ProductMap.configureExchange(EXCHANGE);
    let product = products[0];
    const config: LiveBookConfig = {
        product: product,
        logger: logger
    };
    const book = new LiveOrderbook(config);
    book.on('LiveOrderbook.snapshot', () => {
        logger.log('info', 'Snapshot received by LiveOrderbook Demo for '+product);
    });
    book.on('LiveOrderbook.ticker', (ticker: Ticker) => {
        console.log(printTicker(ticker));
    });
    book.on('LiveOrderbook.trade', (trade: TradeMessage) => {
        tradeVolume += +(trade.size);
    });
    book.on('LiveOrderbook.skippedMessage', (details: SkippedMessageEvent) => {
        // On GDAX, this event should never be emitted, but we put it here for completeness
        console.log('SKIPPED MESSAGE', details);
        console.log('Reconnecting to feed');
    });
    book.on('end', () => {
        console.log('Orderbook closed');
    });
    book.on('error', (err) => {
        console.log('Livebook errored: ', err);
    });
    console.log('Setting timer')
    setInterval(() => {
        console.log('info','Cleared Book');
        book.book.clear();
        feed.reset();
        console.log('Reset feed');
        console.log('');
        process.stdout.write(`Used memory in MB : ${process.memoryUsage().heapUsed / (1000 * 1000)} \r`);
    },1000 * 10)
    feed.pipe(book);
}

start();