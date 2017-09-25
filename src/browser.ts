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
var quoteSocket = io('http://localhost:3250/quotes', connectionOptions);


var subscriptions = new Map<string, LiveOrderbook>()
export class SocketIOReadStream extends Readable {
    constructor() {
        super({objectMode : true});
        var self = this;
        quoteSocket.on('connect', () => {
            console.log('Connection established');
            subscriptions.forEach((book, product) => {
                subscribe(product);
            })
            //Join channel and request snapshot for all subscriptions
            quoteSocket.on('stream', function (data:any) {
                self.push(data)
            });
            quoteSocket.on('snapshot', processSnaphshot)
        });
    }
    _read(size: number) {
        // This is not an on-demand service. For that, I refer you to Netflix. Data gets pushed to the queue as it comes
        // in from the websocket, so there's nothing to do here.
    }
}
let Socket = new SocketIOReadStream();

function subscribe(product:string) {
    quoteSocket.emit('subscribe', product)
    getSnapshot(product);
}

function unSubscribe(product:string) {
    quoteSocket.emit('unsubscribe', product)
}

function processSnaphshot(data:any) {
    console.info('Received snapshot ');
    let snapshot:SnapshotMessage = data;
    const bids: PriceLevelWithOrders[] = [];
    const asks: PriceLevelWithOrders[] = [];
    const orders: OrderPool = {};
    Object.keys(snapshot.orderPool).forEach(orderKey => {
        let oldOrder = snapshot.orderPool[orderKey];
        const newOrder: Level3Order = {
            id: <any>oldOrder.price,
            price: Big(oldOrder.price),
            size: Big(oldOrder.size),
            side: oldOrder.side
        }; 
        orders[newOrder.id] = newOrder;
        const level: PriceLevelWithOrders = {
            price: Big(oldOrder.price),
            totalSize: Big(oldOrder.size).abs(),
            orders: [ newOrder ]
        };
        if (newOrder.side === 'buy') {
            bids.push(level);
        } else {
            asks.push(level);
        }
    }); 
    snapshot.asks = asks;
    snapshot.bids = bids;
    snapshot.orderPool = orders
    Socket.push(snapshot)
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
        console.log('SKIPPED MESSAGE', details);
        console.log('Requesting snapshot again');
        getSnapshot(product);
    });
    subscriptions.set(product, Book);
    subscribe(product);
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
