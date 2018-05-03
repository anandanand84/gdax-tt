/// <reference types="node" />
/// <reference types="ioredis" />
/// <reference types="bignumber.js" />
import { AggregatedLevelWithOrders, Level3Order, RemoteOrderbook, OrderbookState } from './';
import { BigJS } from './types';
import { Pipeline } from 'ioredis';
import { TradeMessage } from '../core/Messages';
import { LiveBookConfig } from '../core';
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
export declare class RedisBookConfig extends LiveBookConfig {
    exchange: string;
}
export declare class RedisBook extends Writable implements RemoteOrderbook {
    private _bidsTotal;
    private _bidsValueTotal;
    private _asksTotal;
    private _asksValueTotal;
    protected _sourceSequence: number;
    private sequence;
    private redisclient;
    private redisct;
    private product;
    private symbol;
    readonly baseCurrency: string;
    readonly quoteCurrency: string;
    private SET_KEY_BID;
    private SET_KEY_ASK;
    private KEY_BOOK_INFO;
    private PARTIAL_KEY_BOOK_INFO_BID;
    private PARTIAL_KEY_BOOK_INFO_ASK;
    private exchange;
    protected snapshotReceived: boolean;
    protected lastBookUpdate: Date;
    private DELETE_LUA_SCRIPT;
    private BEST_BID_LUA_SCRIPT;
    private BEST_ASK_LUA_SCRIPT;
    state(): Promise<OrderbookState>;
    fromState(state: OrderbookState): void;
    constructor(config: RedisBookConfig);
    clear(pipeline: Pipeline): void;
    _write(msg: any, encoding: string, callback: () => void): void;
    private processSnapshot(snapshot);
    /**
     * Handles order messages from aggregated books
     * @param msg
     */
    private processLevelChange(msg);
    private checkSequence(sequence);
    private emitError(message?);
    processTradeMessage(msg: TradeMessage): void;
    readonly bidsTotal: BigJS;
    readonly bidsValueTotal: BigJS;
    readonly asksTotal: BigJS;
    readonly asksValueTotal: BigJS;
    getNumAsks(): Promise<number>;
    getNumBids(): Promise<number>;
    getBidsTotal(): Promise<BigNumber.BigNumber>;
    getAsksTotal(): Promise<BigNumber.BigNumber>;
    getSequence(): Promise<number>;
    getHighestBid(): Promise<AggregatedLevelWithOrders>;
    getLowestAsk(): Promise<AggregatedLevelWithOrders>;
    getLevel(side: string, price: BigJS): Promise<AggregatedLevelWithOrders>;
    /**
     * Add an order's information to the book
     * @param order
     */
    add(order: Level3Order): boolean;
    updateRedis(side: string, level: AggregatedLevelWithOrders, pipeline: Pipeline): void;
    addLevel(side: string, level: AggregatedLevelWithOrders, pipeline: Pipeline): void;
    /**
     * Remove a complete level and links to orders in the order pool. If the price level doesn't exist, it returns
     * false
     */
    removeLevel(side: string, priceLevel: AggregatedLevelWithOrders, pipeline: Pipeline): boolean;
    /**
     * Shortcut method for replacing a level. First removeLevel is called, and then addLevel
     */
    setLevel(side: string, level: AggregatedLevelWithOrders, pipeline: Pipeline): boolean;
    /**
     * Remove the order from the orderbook If numOrders drops to zero, remove the level
     */
    remove(orderId: string): Level3Order;
    protected subtractFromTotal(amount: BigJS, side: string, price: BigJS): void;
    protected addToTotal(amount: BigJS, side: string, price: BigJS): void;
}
