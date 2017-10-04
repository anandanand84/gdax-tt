import { Error } from 'tslint/lib/error';
import { RBTree } from 'bintrees';
import { Logger } from '../utils';
import {
    AggregatedLevelWithOrders,
    BookBuilder,
    Level3Order,
    Orderbook,
    PriceComparable
} from './';
import { BigJS, ZERO } from './types';
import assert = require('assert');
import { getClient } from '../core/RedisConnector'

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

export class RedisBookBuilder extends BookBuilder implements Orderbook {
    public sequence: number = -1;
    protected bids: RBTree<AggregatedLevelWithOrders>;
    protected asks: RBTree<AggregatedLevelWithOrders>;
    protected _bidsTotal: BigJS = ZERO;
    protected _bidsValueTotal: BigJS = ZERO;
    protected _asksTotal: BigJS = ZERO;
    protected _asksValueTotal: BigJS = ZERO;
    private redisclient:any;
    private product:string
    private SET_KEY_BID:string
    private SET_KEY_ASK:string
    private KEY_BOOK_INFO:string
    private PARTIAL_KEY_BOOK_INFO_BID:string
    private PARTIAL_KEY_BOOK_INFO_ASK:string
    private exchange:string
    private DELETE_LUA_SCRIPT:string = `local keysToDelete = redis.call('keys', ARGV[1]) 
    for i,key in ipairs(keysToDelete)
    do
        return redis.call('del', key)
    end`

    constructor(exchange:string, product:string, logger: Logger ) {
        super(logger);
        this.redisclient = getClient();
        this.product = product;
        this.exchange = exchange;
        this.SET_KEY_BID = `{${this.exchange}:${this.product}}:BIDS`;
        this.SET_KEY_ASK = `{${this.exchange}:${this.product}}:ASKS`;
        this.KEY_BOOK_INFO = `{${this.exchange}:${this.product}}:BOOK:INFO`;
        this.PARTIAL_KEY_BOOK_INFO_BID = `{${this.exchange}:${this.product}}:BID:INFO:`
        this.PARTIAL_KEY_BOOK_INFO_ASK = `{${this.exchange}:${this.product}}:ASK:INFO:`
    }

    clear() {
        super.clear();
        if(this.redisclient) {  
            //SET containing the bids and asks
            this.redisclient.del(this.SET_KEY_BID)
            this.redisclient.del(this.SET_KEY_ASK)
            
            //HASH containing the products totalbids, ask values
            this.redisclient.del(this.KEY_BOOK_INFO)
            
            this.redisclient.set(this.PARTIAL_KEY_BOOK_INFO_ASK+':dummy', 'dummy')
            this.redisclient.set(this.PARTIAL_KEY_BOOK_INFO_BID+':dummy', 'dummy')
    
            //HASH containing respective level bid and ask information size and value
            this.redisclient.eval(this.DELETE_LUA_SCRIPT, 0, this.PARTIAL_KEY_BOOK_INFO_ASK+'*')
            this.redisclient.eval(this.DELETE_LUA_SCRIPT, 0, this.PARTIAL_KEY_BOOK_INFO_BID+'*')
            console.log('Cleared REDIS BOOK for product', `${this.exchange}:${this.product}`)
            // level 3 orders not supported yet
            // this.redisclient.del(`{${EXCHANGE}:${this.product}}:BIDS:*:ORDERS`)
            // this.redisclient.del(`{${EXCHANGE}:${this.product}}:ASKS:*:ORDERS`)
        }
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

    get numAsks(): number {
        return this.asks.size;
    }

    get numBids(): number {
        return this.bids.size;
    }

    get highestBid(): AggregatedLevelWithOrders {
        return this.bids.max();
    }

    get lowestAsk(): AggregatedLevelWithOrders {
        return this.asks.min();
    }

    getLevel(side: string, price: BigJS): AggregatedLevelWithOrders {
        const tree = this.getTree(side);
        return tree.find({ price: price } as any);
    }

    /**
     * Add an order's information to the book
     * @param order
     */
    add(order: Level3Order): boolean {
        console.error('Level 3 orders not handled in redis use setLevel, addLevel')
        return null;
        // const side = order.side;
        // const tree = this.getTree(side);
        // let level = new AggregatedLevelWithOrders(order.price);
        // const existing: AggregatedLevelWithOrders = tree.find(level);
        // if (existing) {
        //     level = existing;
        // } else {
        //     if (!tree.insert(level)) {
        //         return false;
        //     }
        // }
        // // Add order to the aggregated level
        // if (!level.addOrder(order)) {
        //     return false;
        // }
        // // Update global order pool stats
        // this._orderPool[order.id] = order;
        // this.addToTotal(order.size, order.side, order.price);
        // return true;
    }

    /**
     * Changes the size of an existing order to newSize. If the order doesn't exist, returns false.
     * If the newSize is zero, the order is removed.
     * If newSize is negative, an error is thrown.
     * It is possible for an order to switch sides, in which case the newSide parameter determines the new side.
     */
    modify(id: string, newSize: BigJS, newSide?: string): boolean {
        console.error('Level 3 orders not handled in redis use setLevel, addLevel, removeLevel')
        return null;
        // if (newSize.lt(ZERO)) {
        //     throw new Error('Cannot set an order size to a negative number');
        // }
        // const order = this.getOrder(id);
        // if (!order) {
        //     return false;
        // }
        // if (!this.remove(id)) {
        //     return false;
        // }
        // if (newSize.gt(ZERO)) {
        //     order.size = newSize;
        //     order.side = newSide || order.side;
        //     this.add(order);
        // }
        // return true;
    }

    updateRedis(side:string, level:AggregatedLevelWithOrders) {
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
        this.redisclient.hmset(infoKey, totalSizeKey, totalSize, totalValueKey, totalValue, 'sequence',  this.sequence );
    }

    // Add a complete price level with orders to the order book. If the price level already exists, throw an exception
    addLevel(side: string, level: AggregatedLevelWithOrders) {
        const tree = this.getTree(side);
        if (tree.find(level)) {
            throw new Error(`cannot add a new level to orderbook since the level already exists at price ${level.price.toString()}`);
        }
        tree.insert(level);
        this.addToTotal(level.totalSize, side, level.price);
        // Add links to orders
        level.orders.forEach((order: Level3Order) => {
            this._orderPool[order.id] = order;
        });
        let bookKey = this.SET_KEY_ASK;
        let price = level.price.toString();
        let specificKey = this.PARTIAL_KEY_BOOK_INFO_ASK + price;;
        if(side === 'buy') {
            bookKey = this.SET_KEY_BID;
            specificKey = this.PARTIAL_KEY_BOOK_INFO_BID + price;;
        }
        this.redisclient.zadd(bookKey, price, price);
        this.redisclient.hmset(specificKey, 'totalSize', level.totalSize, 'totalValue', level.totalValue, 'price', price);
        this.updateRedis(side, level);
    }
    
    /**
     * Remove a complete level and links to orders in the order pool. If the price level doesn't exist, it returns
     * false
     */
    removeLevel(side: string, priceLevel: PriceComparable): boolean {
        const tree = this.getTree(side);
        const level: AggregatedLevelWithOrders = tree.find(priceLevel as any);
        if (!level) {
            return false;
        }
        assert(tree.remove(level));
        level.orders.forEach((order: Level3Order) => {
            delete this.orderPool[order.id];
        });
        this.subtractFromTotal(level.totalSize, side, level.price);
        let bookKey = this.SET_KEY_ASK;
        let price = level.price.toString();
        let specificKey = this.PARTIAL_KEY_BOOK_INFO_ASK + price;;
        if(side === 'buy') {
            bookKey = this.SET_KEY_BID;
            specificKey = this.PARTIAL_KEY_BOOK_INFO_BID + price;;
        }
        this.redisclient.zrem(bookKey, level.price.toString());
        this.redisclient.del(specificKey);
        this.updateRedis(side, level);
        return true;
    }

    /**
     * Shortcut method for replacing a level. First removeLevel is called, and then addLevel
     */
    setLevel(side: string, level: AggregatedLevelWithOrders): boolean {
        this.removeLevel(side, level);
        if (level.numOrders > 0) {
            this.addLevel(side, level);
        }
        return true;
    }

    /**
     * Remove the order from the orderbook If numOrders drops to zero, remove the level
     */
    remove(orderId: string): Level3Order {
        console.error('Level 3 orders not handled in redis use setLevel, addLevel, removeLevel')
        return null;
        // const order: Level3Order = this.getOrder(orderId);
        // if (!order) {
        //     return null;
        // }
        // const side = order.side;
        // const tree = this.getTree(side);
        // let level = new AggregatedLevelWithOrders(order.price);
        // level = tree.find(level);
        // if (!level) {
        //     // If a market order has filled, we can carry on
        //     if (order.size.eq(ZERO)) {
        //         return order;
        //     }
        //     console.warn('error', `There should have been orders at price level ${order.price} for at least ${order.size}, but there were none`);
        //     return null;
        // }
        // if (this.removeFromPool(order.id)) {
        //     this.subtractFromTotal(order.size, order.side, order.price);
        // }
        // level.removeOrder(order.id);
        // if (level.numOrders === 0) {
        //     if (!(level.totalSize.eq(ZERO))) {
        //         console.warn('error', `Total size should be zero at level $${level.price} but was ${level.totalSize}.`);
        //         return null;
        //     }
        //     tree.remove(level);
        // }
        // return order;
    }
}
