/// <reference types="ws" />
import { ExchangeFeed } from '../ExchangeFeed';
import WebSocket = require('ws');
import * as GI from './BinanceInterfaces';
import { BinanceMessage, BinanceSnapshotMessage, BinanceDepthMessage } from './BinanceInterfaces';
export declare const BINANCE_WS_FEED: string;
export declare class BinanceFeed extends ExchangeFeed {
    readonly owner: string;
    readonly feedUrl: string;
    protected lastHeartBeat: number;
    private totalMessageCount;
    private lastMessageTime;
    private lastTradeTime;
    private totalMessageInterval;
    private counters;
    private sequences;
    protected initialMessagesQueue: {
        [product: string]: BinanceMessage[];
    };
    protected depthsockets: {
        [product: string]: WebSocket;
    };
    protected tradesockets: {
        [product: string]: WebSocket;
    };
    private MAX_QUEUE_LENGTH;
    private erroredProducts;
    constructor(config: GI.BinanceFeedConfig);
    protected getWebsocketUrlForProduct(product: string): string;
    retryErroredProducts(): void;
    protected connect(products?: string[]): Promise<void>;
    subscribeProduct(product: string): Promise<void>;
    protected handleMessage(): void;
    protected handleSnapshotMessage(msg: BinanceSnapshotMessage, productId?: string): void;
    protected handleTradeMessages(msg: string, productId?: string): void;
    protected handleDepthMessages(msg: string, productId?: string): void;
    nextSequence(prodcutId: string): number;
    processLevelMessage(depthMessage: BinanceDepthMessage): void;
    protected onOpen(): void;
    private createSnapshotMessage(msg);
}
