import { Logger } from '../utils';
import {
    AggregatedLevelWithOrders,
    BookBuilder,
    Level3Order,
    Orderbook,
    PriceComparable,
    RemoteOrderbook,
    OrderbookState,
    PriceLevelWithOrders,
    AggregatedLevelFactory,
    AggregatedLevelFromPriceLevel
} from './';
import { BigJS, ZERO, Big } from './types';
import { Redis, Pipeline } from 'ioredis';
import assert = require('assert');
import { getClient, getRedisct } from '../core/RedisConnector'
import { TradeMessage, isStreamMessage, SnapshotMessage, LevelMessage, OrderbookMessage } from '../core/Messages';
import { EventEmitter } from 'events';
import { LiveBookConfig, SequenceStatus, SkippedMessageEvent } from '../core';
import { Writable } from 'stream';

/**
 * For cumulative order calculations, indicates at which price to start counting at and from which order size to start
 * within that level
 */
/**
 * BookBuilder is a convenience class for maintaining an in-memory Level 3 order book. Each
 * side of the book is represented internally by a binary tree and a global order hash map
 *
 * The individual orders can be tracked globally via the orderPool set, or per level. The orderpool and the aggregated
 * levels point to the same order objects, and not copies.
 *
 * Call #state to get a hierarchical object representation of the orderbook
 */

export class RedisBookConfig extends LiveBookConfig {
    exchange: string
}

export class RedisBook extends Writable implements RemoteOrderbook {
    
    private _bidsTotal:BigJS = ZERO;
    private _bidsValueTotal:BigJS = ZERO;
    private _asksTotal:BigJS = ZERO;
    private _asksValueTotal:BigJS = ZERO;
    protected _sourceSequence: number;

    private sequence: number = -1;
    private redisclient:Redis;
    private redisct: any;

    private product:string
    private symbol:string
    
    public readonly baseCurrency: string;
    public readonly quoteCurrency: string;

    private SET_KEY_BID:string
    private SET_KEY_ASK:string
    private KEY_BOOK_INFO:string
    private PARTIAL_KEY_BOOK_INFO_BID:string
    private PARTIAL_KEY_BOOK_INFO_ASK:string
    private exchange:string

    protected snapshotReceived: boolean;
    protected lastBookUpdate: Date;
    
    private DELETE_LUA_SCRIPT:string = `local keysToDelete = redis.call('keys', ARGV[1]) 
    for i,key in ipairs(keysToDelete)
    do
        return redis.call('del', key)
    end`

    private BEST_BID_LUA_SCRIPT:string = `
        local bestBidSet = KEYS[1]..':BIDS';
        local bestBidInfoMap = KEYS[1]..':BID:INFO:';
        local bestBid = redis.call('ZREVRANGE', bestBidSet, 0, 0);
        local bestBidLevel = redis.call('HGETALL', bestBidInfoMap..bestBid[1])
        return bestBidLevel
    `
    
    private BEST_ASK_LUA_SCRIPT:string = `
        local bestAskSet = KEYS[1]..':ASKS';
        local bestAskInfoMap = KEYS[1]..':ASK:INFO:';
        local bestAsk = redis.call('ZRANGE', bestAskSet, 0, 0);
        local bestAskLevel = redis.call('HGETALL', bestAskInfoMap..bestAsk[1])
        return bestAskLevel
    `

    state(): Promise<OrderbookState> {
        throw new Error("Method not implemented.");
    }

    fromState(state: OrderbookState) {
        var pipeline = this.redisclient.pipeline();
        this.clear(pipeline);
        pipeline.exec().then(()=>{ console.log('Cleared book for ', this.product)})
        this.sequence = state.sequence;
        var pipeline = this.redisclient.pipeline();
        state.asks.forEach((priceLevel: PriceLevelWithOrders) => {
            const level: AggregatedLevelWithOrders = AggregatedLevelFromPriceLevel(priceLevel);
            this.setLevel('sell', level, pipeline);
        });
        pipeline.exec().then(()=> { console.log('Ask snapshot updated for ', this.product) })
        var pipeline = this.redisclient.pipeline();
        state.bids.forEach((priceLevel: PriceLevelWithOrders) => {
            const level: AggregatedLevelWithOrders = AggregatedLevelFromPriceLevel(priceLevel);
            this.setLevel('buy', level, pipeline);
        });
        pipeline.exec().then(()=> { console.log('Bid snapshot updated for ', this.product) })
    }

    constructor(config: RedisBookConfig ) {
        super({ objectMode: true, highWaterMark: 1024 });
        console.log('Using new redis book, no inmemory data')
        this.product = config.product;
        [this.baseCurrency, this.quoteCurrency] = this.product.split('/');
        this.snapshotReceived = false;
        this.redisclient = getClient();
        this.redisct = getRedisct();
        this.exchange = config.exchange;
        this.symbol = `${this.exchange}:${this.product}`
        this.SET_KEY_BID = `{${this.exchange}:${this.product}}:BIDS`;
        this.SET_KEY_ASK = `{${this.exchange}:${this.product}}:ASKS`;
        this.KEY_BOOK_INFO = `{${this.exchange}:${this.product}}:BOOK:INFO`;
        this.PARTIAL_KEY_BOOK_INFO_BID = `{${this.exchange}:${this.product}}:BID:INFO:`
        this.PARTIAL_KEY_BOOK_INFO_ASK = `{${this.exchange}:${this.product}}:ASK:INFO:`
    }


    clear(pipeline:Pipeline) {
        if(this.redisclient) {  
            //SET containing the bids and asks
            pipeline.del(this.SET_KEY_BID)
            pipeline.del(this.SET_KEY_ASK)
            
            // Trade History && Trade cum value
            pipeline.del(`{${this.exchange}:${this.product}}:TRADES`);
            pipeline.del(`{${this.exchange}:${this.product}}:T:T`);
            pipeline.del(`{${this.exchange}:${this.product}}:T:B:S`);
            pipeline.del(`{${this.exchange}:${this.product}}:T:B:C`);
            pipeline.del(`{${this.exchange}:${this.product}}:T:B:V`);
            pipeline.del(`{${this.exchange}:${this.product}}:T:S:S`);
            pipeline.del(`{${this.exchange}:${this.product}}:T:S:V`);
            pipeline.del(`{${this.exchange}:${this.product}}:T:S:C`);
            
            //HASH containing the products totalbids, ask values
            pipeline.del(this.KEY_BOOK_INFO)
            
            pipeline.set(this.PARTIAL_KEY_BOOK_INFO_ASK+':dummy', 'dummy')
            pipeline.set(this.PARTIAL_KEY_BOOK_INFO_BID+':dummy', 'dummy')
    
            //HASH containing respective level bid and ask information size and value
            pipeline.eval(this.DELETE_LUA_SCRIPT, 0, this.PARTIAL_KEY_BOOK_INFO_ASK+'*')
            pipeline.eval(this.DELETE_LUA_SCRIPT, 0, this.PARTIAL_KEY_BOOK_INFO_BID+'*')
            // level 3 orders not supported yet
            // this.redisclient.del(`{${EXCHANGE}:${this.product}}:BIDS:*:ORDERS`)
            // this.redisclient.del(`{${EXCHANGE}:${this.product}}:ASKS:*:ORDERS`)
        }
    }

    public _write(msg: any, encoding: string, callback: () => void): void {
        // Pass the msg on to downstream users
        // this.push(msg);
        // Process the message for the orderbook state
        process.nextTick(()=> {
            if (!isStreamMessage(msg) || !msg.productId) {
                return callback();
            }
            if (msg.productId !== this.product) {
                return callback();
            }
            switch (msg.type) {
                case 'snapshot':
                this.processSnapshot(msg as SnapshotMessage);
                break;
                case 'level':
                    this.processLevelChange(msg as LevelMessage);
                    this.emit('LiveOrderbook.update', msg);
                    break;
                default:
                    this.emit('LiveOrderbook.update', msg);
                    break;
            }
            callback();
        })
    }

    private processSnapshot(snapshot: SnapshotMessage) {
        this.fromState(snapshot);
        this._sourceSequence = snapshot.sourceSequence;
        this.snapshotReceived = true;
        this.emit('LiveOrderbook.snapshot', snapshot);
    }

    /**
     * Handles order messages from aggregated books
     * @param msg
     */
    private processLevelChange(msg: LevelMessage): void {
        if (!msg.sequence) {
            return;
        }
        this._sourceSequence = msg.sourceSequence;
        const sequenceStatus = this.checkSequence(msg.sequence);
        if (sequenceStatus === SequenceStatus.ALREADY_PROCESSED) {
            return;
        }
        const level: AggregatedLevelWithOrders = AggregatedLevelFactory(msg.size, msg.price, msg.side);
        var pipeline = this.redisclient.pipeline();
        this.setLevel(msg.side, level, pipeline);
        pipeline.exec();
    }

    private checkSequence(sequence: number): SequenceStatus {
        if (sequence <= this.sequence) {
            return SequenceStatus.ALREADY_PROCESSED;
        }
        if (sequence !== this.sequence + 1) {
            // Dropped a message, restart the synchronising
            console.log('info', `Dropped a message. Expected ${this.sequence + 1} but received ${sequence}.`);
            const event: SkippedMessageEvent = {
                expected_sequence: this.sequence + 1,
                sequence: sequence
            };
            const diff: number = event.expected_sequence - event.sequence;
            const msg = `LiveOrderbook detected a skipped message. Expected ${event.expected_sequence}, but received ${event.sequence}. Diff = ${diff}`;
            this.emit('LiveOrderbook.skippedMessage', event);
            return SequenceStatus.SKIP_DETECTED;
        }
        this.lastBookUpdate = new Date();
        this.sequence = sequence;
        return SequenceStatus.OK;
    }

    private emitError(message?: OrderbookMessage) {
        const err: any = new Error('An inconsistent orderbook state occurred');
        err.msg = message;
        console.error(err.message, { message: message });
        this.emit('error', err);
    }

    processTradeMessage(msg:TradeMessage) {
        // this._book.processTradeMessage(msg);
    }

    get bidsTotal(): BigJS {
        return this._bidsTotal;
    }

    get bidsValueTotal(): BigJS {
        return this._bidsValueTotal;
    }

    get asksTotal(): BigJS {
        return this._asksTotal;
    }

    get asksValueTotal(): BigJS {
        return this._asksValueTotal;
    }
    getNumAsks(): Promise<number> {
        throw new Error("Method not implemented.");
    }
    getNumBids(): Promise<number> {
        throw new Error("Method not implemented.");
    }
    getBidsTotal(): Promise<BigNumber.BigNumber> {
        throw new Error("Method not implemented.");
    }
    getAsksTotal(): Promise<BigNumber.BigNumber> {
        throw new Error("Method not implemented.");
    }
    getSequence(): Promise<number> {
        throw new Error("Method not implemented.");
    }

    async getHighestBid(): Promise<AggregatedLevelWithOrders> {
        var level = await this.redisclient.eval(this.BEST_BID_LUA_SCRIPT, 1, `{${this.symbol}}`)
        level = AggregatedLevelFactory(level[1],level[5], 'buy');
        return level;
    }

    async getLowestAsk(): Promise<AggregatedLevelWithOrders> {
       var level = await this.redisclient.eval(this.BEST_ASK_LUA_SCRIPT, 1, `{${this.symbol}}`)
       level = AggregatedLevelFactory(level[1], level[5], 'sell');
       return level;
    }

    async getLevel(side: string, price: BigJS): Promise<AggregatedLevelWithOrders> {
        var level = null;
        if(side === 'buy') {
            level = await this.redisclient.hgetall(this.PARTIAL_KEY_BOOK_INFO_BID + price);
            level = AggregatedLevelFactory(level[1],level[5], 'buy');
        }
        else {
            level = await this.redisclient.hgetall(this.PARTIAL_KEY_BOOK_INFO_BID + price);
            level = AggregatedLevelFactory(level[1],level[5], 'sell');
        }
        return level;
    }

    /**
     * Add an order's information to the book
     * @param order
     */
    add(order: Level3Order): boolean {
        console.error('Level 3 orders not handled in redis')
        return null;
    }

    // processTradeMessage(msg:TradeMessage) {
    //     let price = Big(msg.price);
    //     let size = Big(msg.size);
    //     let value = price.mul(size);
    //     let time = msg.time;
    //     let side = msg.side;
    //     let tradeId = msg.tradeId
    //     this.redisct.saveTradeMessage({ symbol : this.symbol, time, price, size, value, side, tradeId})
    // }

    updateRedis(side:string, level:AggregatedLevelWithOrders, pipeline:Pipeline) {
        let infoKey = this.KEY_BOOK_INFO;
        let totalValue = this._asksValueTotal.toString();
        let totalSize = this._asksTotal.toString();
        let totalValueKey = 'askTotalValue';
        let totalSizeKey = 'askTotalSize';
        if(side === 'buy') {
            totalSize = this._bidsTotal.toString();
            totalValue = this._bidsValueTotal.toString();
            totalValueKey = 'bidTotaValue';
            totalSizeKey = 'bidTotalSize';
        }
        pipeline.hmset(infoKey, totalSizeKey, totalSize, totalValueKey, totalValue, 'sequence',  this.sequence );
    }

    // Add a complete price level with orders to the order book. If the price level already exists, throw an exception
    addLevel(side: string, level: AggregatedLevelWithOrders, pipeline:Pipeline) {
        this.addToTotal(level.totalSize, side, level.price);
        // Add links to orders
        let price = level.price.toString();
        let bookKey = this.SET_KEY_ASK;
        let specificKey = this.PARTIAL_KEY_BOOK_INFO_ASK + price;;
        if(side === 'buy') {
            bookKey = this.SET_KEY_BID;
            specificKey = this.PARTIAL_KEY_BOOK_INFO_BID + price;;
        }
        pipeline.zadd(bookKey, price, price);
        pipeline.hmset(specificKey, 'totalSize', level.totalSize, 'totalValue', level.totalValue, 'price', price);
        this.updateRedis(side, level, pipeline);
    }
    
    /**
     * Remove a complete level and links to orders in the order pool. If the price level doesn't exist, it returns
     * false
     */
    removeLevel(side: string, priceLevel: AggregatedLevelWithOrders, pipeline:Pipeline): boolean {
        const level: AggregatedLevelWithOrders = priceLevel;
        this.subtractFromTotal(level.totalSize, side, level.price);
        let bookKey = this.SET_KEY_ASK;
        let price = level.price.toString();
        let specificKey = this.PARTIAL_KEY_BOOK_INFO_ASK + price;;
        if(side === 'buy') {
            bookKey = this.SET_KEY_BID;
            specificKey = this.PARTIAL_KEY_BOOK_INFO_BID + price;;
        }
        pipeline.zrem(bookKey, level.price.toString());
        pipeline.del(specificKey);
        this.updateRedis(side, level, pipeline);
        return true;
    }

    /**
     * Shortcut method for replacing a level. First removeLevel is called, and then addLevel
     */
    setLevel(side: string, level: AggregatedLevelWithOrders, pipeline:Pipeline): boolean {
        this.removeLevel(side, level, pipeline);
        if (level.numOrders > 0) {
            this.addLevel(side, level, pipeline);
        }
        return true;
    }

    /**
     * Remove the order from the orderbook If numOrders drops to zero, remove the level
     */
    remove(orderId: string): Level3Order {
        console.error('Level 3 orders not handled in redis')
        return null;
    }

    protected subtractFromTotal(amount: BigJS, side: string, price: BigJS) {
        if (side === 'buy') {
            this._bidsTotal = this._bidsTotal.minus(amount);
            this._bidsValueTotal = this._bidsValueTotal.minus(amount.times(price));
        } else {
            this._asksTotal = this._asksTotal.minus(amount);
            this._asksValueTotal = this._asksValueTotal.minus(amount.times(price));
        }
    }

    protected addToTotal(amount: BigJS, side: string, price: BigJS) {
        if (side === 'buy') {
            this._bidsTotal = this._bidsTotal.plus(amount);
            this._bidsValueTotal = this._bidsValueTotal.plus(amount.times(price));
        } else {
            this._asksTotal = this._asksTotal.plus(amount);
            this._asksValueTotal = this._asksValueTotal.plus(amount.times(price));
        }
    }
}
