/// <reference types="bintrees" />
import { RBTree } from 'bintrees';
import { Logger } from '../utils';
import { AggregatedLevelWithOrders, BookBuilder, Level3Order, Orderbook, PriceComparable } from './';
import { BigJS } from './types';
import { TradeMessage } from '../core/Messages';
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
export declare class RedisBookBuilder extends BookBuilder implements Orderbook {
    sequence: number;
    protected bids: RBTree<AggregatedLevelWithOrders>;
    protected asks: RBTree<AggregatedLevelWithOrders>;
    protected _bidsTotal: BigJS;
    protected _bidsValueTotal: BigJS;
    protected _asksTotal: BigJS;
    protected _asksValueTotal: BigJS;
    private redisclient;
    private redisct;
    private product;
    private symbol;
    private SET_KEY_BID;
    private SET_KEY_ASK;
    private KEY_BOOK_INFO;
    private PARTIAL_KEY_BOOK_INFO_BID;
    private PARTIAL_KEY_BOOK_INFO_ASK;
    private exchange;
    private DELETE_LUA_SCRIPT;
    constructor(exchange: string, product: string, logger: Logger);
    clear(): void;
    readonly bidsTotal: BigJS;
    readonly bidsValueTotal: BigJS;
    readonly asksTotal: BigJS;
    readonly asksValueTotal: BigJS;
    readonly numAsks: number;
    readonly numBids: number;
    readonly highestBid: AggregatedLevelWithOrders;
    readonly lowestAsk: AggregatedLevelWithOrders;
    getLevel(side: string, price: BigJS): AggregatedLevelWithOrders;
    /**
     * Add an order's information to the book
     * @param order
     */
    add(order: Level3Order): boolean;
    processTradeMessage(msg: TradeMessage): void;
    /**
     * Changes the size of an existing order to newSize. If the order doesn't exist, returns false.
     * If the newSize is zero, the order is removed.
     * If newSize is negative, an error is thrown.
     * It is possible for an order to switch sides, in which case the newSide parameter determines the new side.
     */
    modify(id: string, newSize: BigJS, newSide?: string): boolean;
    updateRedis(side: string, level: AggregatedLevelWithOrders): void;
    addLevel(side: string, level: AggregatedLevelWithOrders): void;
    /**
     * Remove a complete level and links to orders in the order pool. If the price level doesn't exist, it returns
     * false
     */
    removeLevel(side: string, priceLevel: PriceComparable): boolean;
    /**
     * Shortcut method for replacing a level. First removeLevel is called, and then addLevel
     */
    setLevel(side: string, level: AggregatedLevelWithOrders): boolean;
    /**
     * Remove the order from the orderbook If numOrders drops to zero, remove the level
     */
    remove(orderId: string): Level3Order;
}
