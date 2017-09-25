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
"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = Object.setPrototypeOf ||
        ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
        function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t;
    return { next: verb(0), "throw": verb(1), "return": verb(2) };
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = y[op[0] & 2 ? "return" : op[0] ? "throw" : "next"]) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [0, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var GTT = require("..");
var ProductMap_1 = require("../build/src/exchanges/ProductMap");
var core_1 = require("../build/src/core");
var express = require('express');
var app = express();
var server = require('http').Server(app);
var io = require('socket.io')(server);
io.set('transports', ['websocket']);
var stream_1 = require("stream");
var orderBooks = new Map();
io.of('/quotes').on('connection', function (socket) {
    socket.on('snapshot', function (product) {
        var book = orderBooks.get(product);
        var state = book.state();
        //StreamMessage
        state.type = "snapshot";
        state.time = state.lastBookUpdate;
        //SnapshotMessage
        state.productId = product;
        io.of('/quotes').to(product).emit('snapshot', state);
    });
    socket.on('subscribe', function (product) {
        socket.join(product);
    });
    socket.on('unsubscribe', function (product) {
        socket.leave(product);
    });
});
var SocketStream = (function (_super) {
    __extends(SocketStream, _super);
    function SocketStream() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    SocketStream.prototype.write = function (msg, callback) {
        if (msg.type === 'snapshot') {
            io.of('/quotes').to(msg.productId).emit('snapshot', msg);
            return true;
        }
        io.of('/quotes').to(msg.productId).emit('stream', msg);
        return true;
    };
    return SocketStream;
}(stream_1.Writable));
server.listen(3250, function () {
    console.log('Server listening in 3250');
});
// const products = ['BTC/USDT'];
var logger = GTT.utils.ConsoleLoggerFactory({ level: 'debug' });
// const printOrderbook = GTT.utils.printOrderbook;
var printTicker = GTT.utils.printTicker;
/*
 Simple demo that sets up a live order book and then periodically prints some stats to the console.
 */
var EXCHANGE = process.env.Exchange || "Bittrex";
function start() {
    return __awaiter(this, void 0, void 0, function () {
        var tradeVolume, products, factories, socketStream;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    tradeVolume = 0;
                    return [4 /*yield*/, ProductMap_1.ProductMap.configureExchange(EXCHANGE)];
                case 1:
                    _a.sent();
                    products = ['BTC/USDT', 'ETH/USDT', 'LTC/USDT'] //await ProductMap.ExchangeMap.get(EXCHANGE).getAvailableProducts();
                    ;
                    // products = products.slice(1, 50);
                    console.log('Total available products', products.length);
                    factories = GTT.Factories;
                    socketStream = new SocketStream();
                    factories[EXCHANGE].FeedFactory(logger, products).then(function (feed) {
                        // Configure the live book object
                        console.log('Feed started');
                        var count = 1;
                        products.forEach(function (product) {
                            var config = {
                                product: product,
                                logger: logger
                            };
                            var book = new core_1.LiveOrderbook(config);
                            book.on('LiveOrderbook.snapshot', function () {
                                // logger.log('info', 'Snapshot received by LiveOrderbook Demo for '+product);
                            });
                            book.on('LiveOrderbook.ticker', function (ticker) {
                                // console.log(printTicker(ticker));
                            });
                            book.on('LiveOrderbook.trade', function (trade) {
                                tradeVolume += +(trade.size);
                            });
                            book.on('LiveOrderbook.skippedMessage', function (details) {
                                // On GDAX, this event should never be emitted, but we put it here for completeness
                                console.log('SKIPPED MESSAGE', details);
                                console.log('Reconnecting to feed');
                                feed.reconnect(0);
                            });
                            book.on('end', function () {
                                console.log('Orderbook closed');
                            });
                            book.on('error', function (err) {
                                console.log('Livebook errored: ', err);
                                feed.pipe(book);
                            });
                            feed.pipe(book);
                            orderBooks.set(product, book);
                        });
                        feed.pipe(socketStream);
                    })["catch"](function (err) {
                        logger.error(err);
                    });
                    return [2 /*return*/];
            }
        });
    });
}
start();
