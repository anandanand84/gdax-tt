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
var GTT = require("..");
var RedisBook_1 = require("../src/core/RedisBook");
var stream_1 = require("stream");
var RedisConnector_1 = require("../src/core/RedisConnector");
var tlab_util_1 = require("tlab-util");
var redisct = RedisConnector_1.getRedisct();
var io = RedisConnector_1.getEmitter();
var EXCHANGE = process.env.Exchange || "GDAX";
var orderBooks = new Map();
var SocketStream = (function (_super) {
    __extends(SocketStream, _super);
    function SocketStream() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    SocketStream.prototype.write = function (msg, callback) {
        msg.exchange = EXCHANGE;
        var room = msg.exchange + ":" + msg.productId;
        var orderBookRoom = room + ":book";
        var tickerRoom = room + ":ticker";
        var type = 'book';
        var toRoom = '';
        switch (msg.type) {
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
                var ticker = {
                    type: 'trade',
                    ltt: ltt,
                    scrip: msg.productId,
                    exchange: msg.exchange,
                    ltp: msg.price,
                    volume: msg.size
                };
                io.of('/api/quotes').to(tickerRoom).emit('ticker', Object.assign({}, ticker, { productId: room }));
                var quote = { ts: tlab_util_1.getIntervalTimeStamp(ltt, 60, 0), o: msg.price, h: msg.price, l: msg.price, c: msg.price, v: msg.size, exchange: msg.exchange, scrip: msg.productId };
                redisct.saveQuotes(quote, tlab_util_1.getIntervalTimeStamp(ltt, 86400, 0));
            case 'level':
                toRoom = orderBookRoom;
                type = 'book';
                break;
        }
        io.of('/api/quotes').to(toRoom).emit(type, Object.assign({}, msg, { productId: room }));
        return true;
    };
    return SocketStream;
}(stream_1.Writable));
var logger = GTT.utils.ConsoleLoggerFactory({ level: 'debug' });
function start() {
    return __awaiter(this, void 0, void 0, function () {
        var tradeVolume, products, factories, socketStream;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    tradeVolume = 0;
                    console.log('Configuring Exchange ', EXCHANGE);
                    return [4 /*yield*/, GTT.Exchanges.ProductMap.configureExchange(EXCHANGE)];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, GTT.Exchanges.ProductMap.ExchangeMap.get(EXCHANGE).getAvailableProducts()];
                case 2:
                    products = _a.sent();
                    console.log('Total available products', products.length);
                    factories = GTT.Factories;
                    socketStream = new SocketStream();
                    factories[EXCHANGE].FeedFactory(logger, products).then(function (feed) {
                        // Configure the live book object
                        console.log('Feed started for exchange ', EXCHANGE);
                        products.forEach(function (product) {
                            var config = {
                                product: product,
                                logger: logger,
                                exchange: EXCHANGE
                            };
                            var book = new RedisBook_1.RedisBook(config);
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
