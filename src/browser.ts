import { setTimeout } from 'timers';
import { LiveOrderbook, SnapshotMessage } from './core';
import * as io from 'socket.io-client';
import { Readable } from 'stream';
import { Big } from './lib/types';
import { Level3Order, PriceLevelWithOrders } from './lib/Orderbook';
import { OrderPool } from './lib/BookBuilder';

var connectionOptions:any = {
    "reconnection": true,
    "reconnectionDelay": 2000,                  // starts with 2 secs delay, then 4, 6, 8, until 60 where it stays forever until it reconnects
    "reconnectionDelayMax": 60000,             //1 minute maximum delay between connections
    "reconnectionAttempts": "Infinity",         // to prevent dead clients, having the user to having to manually reconnect after a server restart.
    "timeout": 10000,                           // before connect_error and connect_timeout are emitted.
    "transports": ["websocket"],   // forces the transport to be only websocket. Server needs to be setup as well/
    "secure": true
};
var quoteSocket = io('http://localhost:15000/api/quotes', connectionOptions);
var queue: { [product: string]: any[] } = {};
var queueing: { [product: string]: boolean } = {};
var socketConnected = false;
var subscriptions = new Map<string, LiveOrderbook>()
export class SocketIOReadStream extends Readable {
    constructor() {
        super({objectMode : true});
        var self = this;
        quoteSocket.on('connect', () => {
            socketConnected = true;
            console.log('Connection established');
            subscriptions.forEach((book, product) => {
                subscribe(product);
            })
            //Join channel and request snapshot for all subscriptions
            quoteSocket.on('stream', function (data:any) {
                if(queueing[data.productId]) {
                    queue[data.productId].push(data);
                    if(queue[data.productId].length > 400) {
                        queueing[data.productId] = false;
                        queue[data.productId] = [];
                    } 
                } else {
                    queue[data.productId].forEach(function(oldMessage) {
                        self.push(oldMessage);
                    });
                    self.push(data)
                }
            });
            quoteSocket.on('snapshot', processSnaphshot)
            quoteSocket.on('disconnect', ()=> {
                socketConnected = false;
            });
        });
    }
    _read(size: number) {
        // This is not an on-demand service. For that, I refer you to Netflix. Data gets pushed to the queue as it comes
        // in from the websocket, so there's nothing to do here.
    }
}
let Socket = new SocketIOReadStream();

function subscribe(product:string) {
    queueing[product] = true;
    queue[product] = [];
    quoteSocket.emit('subscribe', product)
    getSnapshot(product);
}

function unSubscribe(product:string) {
    quoteSocket.emit('unsubscribe', product)
}

function processSnaphshot(data:any) {
    try {
        console.info('Received snapshot ');
        let snapshot:SnapshotMessage = {} as SnapshotMessage;
        snapshot.sequence = parseInt(data.info.sequence);
        snapshot.productId = data.productId;
        snapshot.type = 'snapshot';
        const bids: PriceLevelWithOrders[] = [];
        const asks: PriceLevelWithOrders[] = [];
        const orders: OrderPool = {};
        data.bids.forEach((bid:any) => {
            const newOrder: Level3Order = {
                id: <any>bid.price,
                price: Big(bid.price),
                size: Big(bid.totalSize),
                side: 'buy'
            }; 
            orders[newOrder.id] = newOrder;
            const level: PriceLevelWithOrders = {
                price: Big(bid.price),
                totalSize: Big(bid.totalSize).abs(),
                orders: [ newOrder ]
            };
            bids.push(level);
        }); 
        data.asks.forEach((ask:any) => {
            const newOrder: Level3Order = {
                id: <any>ask.price,
                price: Big(ask.price),
                size: Big(ask.totalSize),
                side: 'sell'
            }; 
            orders[newOrder.id] = newOrder;
            const level: PriceLevelWithOrders = {
                price: Big(ask.price),
                totalSize: Big(ask.totalSize).abs(),
                orders: [ newOrder ]
            };
            asks.push(level);
        }); 
        snapshot.asks = asks;
        snapshot.bids = bids;
        snapshot.orderPool = orders
        Socket.push(snapshot)
        queueing[data.productId] = false;
    }catch(err) {
        queueing[data.productId] = false;
    }
}

function getSnapshot(product: any) {
    let book = subscriptions.get(product);
    book.book.clear();
    quoteSocket.emit('snapshot', product);
}

export function subscribeBook(product:any) {
    let book = subscriptions.get(product);
    if(book) {
        return book;
    }
    let Book = new LiveOrderbook({
        product: product,
    })
    Book.on('LiveOrderbook.skippedMessage', (details: any) => {
        // On GDAX, this event should never be emitted, but we put it here for completeness
        if(!queueing[product]){
            queueing[product] = true;
            queue[product] = [];
            console.log('SKIPPED MESSAGE', details);
            console.log('Requesting snapshot again');
            getSnapshot(product);
        }
    });
    subscriptions.set(product, Book);
    if(socketConnected) {
        subscribe(product);
    }
    Socket.pipe(Book)
    return Book;
}

export function unsubscribeBook(product:string) {
    let book = subscriptions.get(product);
    if(!book) {
        console.warn('Unsubscribe recieved for book not present');
        return;
    }
    unSubscribe(product);
    Socket.unpipe(book);
    subscriptions.delete(product);
}

(<any>global).subscribeBook = subscribeBook;
(<any>global).unsubscribeBook = unsubscribeBook;
export default subscribeBook;
