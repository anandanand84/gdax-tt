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

import { Readable } from 'stream';
import { Logger } from '../utils/Logger';
import { ExchangeAuthConfig } from './AuthConfig';
import { createHmac } from 'crypto';
import WebSocket = require('ws');
// import * as WebSocket from 'uws';
import Timer = NodeJS.Timer;

export class ExchangeFeedConfig {
    wsUrl: string;
    logger: Logger;
    auth: ExchangeAuthConfig;
}

// hooks for replacing libraries if desired
export const hooks = {
    WebSocket: WebSocket
};
export abstract class ExchangeFeed extends Readable {
    protected auth: ExchangeAuthConfig;
    protected url: string;
    protected isConnecting: boolean;
    protected lastHeartBeat: number = -1;
    private connectionChecker: Timer = null;
    private socket: WebSocket;
    private _logger: Logger;
    protected multiSocket: boolean = false;
    protected sockets: WebSocket[] = [] //only for multisockets
    
    constructor(config: ExchangeFeedConfig) {
        super({ objectMode: true, highWaterMark: 1024 });
        this._logger = config.logger;
        this.url = config.wsUrl;
        this.isConnecting = false;
        this.auth = this.validateAuth(config.auth);
    }

    get logger(): Logger {
        return this._logger;
    }

    log(level: string, message: string, meta?: any) {
        if (!this._logger) {
            return;
        }
        this._logger.log(level, message, meta);
    }

    isConnected(): boolean {
        return (this.socket && this.socket.readyState === 1) || (this.sockets.length > 0);
    }

    reconnect(delay: number) {
        this._logger.log('debug', `Reconnecting to ${this.url} ${this.auth ? '(authenticated)' : ''} in ${delay * 0.001} seconds...`);
        // If applicable, close the current socket first
        if (this.socket && this.socket.readyState < 2) {
            this._logger.log('debug', 'Closing existing socket prior to reconnecting to ' + this.url);
            this.close();
        }
        setTimeout(() => {
            // Force a reconnect
            this.isConnecting = false;
            this.connect();
        }, delay);
    }

    disconnect() {
        if (!this.isConnected()) {
            return;
        }
        this.close();
    }


    protected connect(products?:string[]) {
        console.log('Is multi sockets : ',this.multiSocket)
        console.log('Products list : ',products)
        if (this.isConnecting || this.isConnected()) {
            return;
        }
        this.isConnecting = true;
        if(this.multiSocket && products && products.length > 0) {
            products.forEach((product)=> {
                const socket = new hooks.WebSocket(this.getWebsocketUrlForProduct(product));
                socket.on('message', (msg: any) => {
                    this.handleMessage(msg, product)
                });
                socket.on('close', this.killProcess);
                socket.on('error', ()=> this.killProcess(null, null));
                this.sockets.push(socket);
                this.lastHeartBeat = -1;
            })
            return;
        }
        
        const socket = new hooks.WebSocket(this.url);
        socket.on('message', (msg: any) => this.handleMessage(msg));
        socket.on('open', () => this.onNewConnection());
        socket.on('close', (code: number, reason: string) => this.onClose(code, reason));
        socket.on('error', (err: Error) => this.onError(err));
        socket.on('pong', ()=> this.confirmAlive());
        socket.on('connection', () => { this.emit('websocket-connection'); });
        this.socket = socket;
        this.lastHeartBeat = -1;
        console.log('Setting up connection checker every 5 sec');
        this.connectionChecker = setInterval(() => {
            this.checkConnection(60 * 1000)
        }, 5 * 1000);
    }

    protected ping() {
        if(this.socket && this.socket.readyState === this.socket.OPEN) {
            this.socket.ping();
        }
    }

    protected getWebsocketUrlForProduct(product:string):string {
        throw('implement in subclass');
    }

    protected killProcess(code:any, message:any) {
        console.error("Socket error or close ");
        console.error("code :", code);
        console.error("Message :", message);
        process.exit(1);
    }

    protected abstract get owner(): string;

    protected abstract handleMessage(msg: string, product?:string): void;

    protected abstract onOpen(): void;

    protected onClose(code: number, reason: string): void {
        this.emit('websocket-closed');
        this.socket = null;
    }

    protected onError(err: Error) {
        if(err)
            this._logger.log(
                'error',
                `The websocket feed to ${this.url} ${this.auth ? '(authenticated)' : ''} has reported an error. If necessary, we will reconnect.`,
                { error: err }
            );``
        if (!this.socket || this.socket.readyState !== 1) {
            this.reconnect(15000);
        } else {
            this.resume();
        }
    }

    /**
     * Called by sub-classes to confirm that the connection is still alive
     */
    protected confirmAlive() {
        this.lastHeartBeat = Date.now();
    }

    protected close() {
        // We're initiating the socket closure, so don't reconnect
        this.socket.removeAllListeners('close');
        this.socket.close();
    }

    protected onNewConnection() {
        this.isConnecting = false;
        this.log('debug', `Connection to ${this.url} ${this.auth ? '(authenticated)' : ''} has been established.`);
        this.onOpen();
        this.emit('websocket-open');
    }

    /**
     * Check that we have received a heartbeat message within the last period ms
     */
    protected checkConnection(period: number) {
        if (this.lastHeartBeat < 0) {
            return;
        }
        const diff = Date.now() - this.lastHeartBeat;
        if (diff > period) {
            this._logger.log(
                'error',
                `No heartbeat has been received from ${this.url} ${this.auth ? '(authenticated)' : ''} in ${diff} ms. Assuming the connection is dead and reconnecting`
            );
            clearInterval(this.connectionChecker);
            this.reconnect(2500);
        }
    }

    /**
     * Checks that the auth object provided is fully populated and is valid. Subclasses can override this to provide
     * additional validation steps.
     *
     * This function should return the auth object or `undefined` if it isn't valid.
     */
    protected validateAuth(auth: ExchangeAuthConfig): ExchangeAuthConfig {
        return auth && auth.key && auth.secret ? auth : undefined;
    }

    protected send(msg: any, cb?: (err: Error) => void): void {
        try {
            const msgString = typeof(msg) === 'string' ? msg : JSON.stringify(msg);
            this.log('debug', `Sending ${msgString} message to WS server`);
            this.socket.send(msgString, cb);
        } catch (err) {
            // If there's an error just log and carry on
            this.log('error', 'Could not send message to GDAX WS server because the message was invalid',
                { error: err, message: msg });
        }
    }

    protected _read(size: number) {
        // This is not an on-demand service. For that, I refer you to Netflix. Data gets pushed to the queue as it comes
        // in from the websocket, so there's nothing to do here.
    }
}

const feedSources: { [index: string]: ExchangeFeed } = {};

export interface ExchangeFeedConstructor<T extends ExchangeFeed, U extends ExchangeFeedConfig> {
    new (config: U): T;
}

/**
 * Get or create a Websocket feed to a GDAX product. A single connection is maintained per URL + auth combination.
 * Usually you'll connect to the  main GDAX feed by passing in `GDAX_WS_FEED` as the first parameter, but you can create
 * additional feeds to the public sandbox, for example by providing the relevant URL; or creating an authenticated and
 * public feed (although the authenticated feed also carries public messages)
 */
export function getFeed<T extends ExchangeFeed, U extends ExchangeFeedConfig>(type: ExchangeFeedConstructor<T, U>, config: U): T {
    const auth = config.auth && config.auth.key && config.auth.secret ? config.auth : undefined;
    const key = getKey(config.wsUrl, auth);
    const logger = config.logger;
    let feed: T = feedSources[key] as T;
    if (!feed) {
        logger.log('info', `Creating new Websocket connection to ${config.wsUrl} ${auth ? '(authenticated)' : ''}`);
        feed = new type(config);
        feedSources[key] = feed;
    } else {
        logger.log('info', `Using existing GDAX Websocket connection to ${config.wsUrl} ${auth ? '(authenticated)' : ''}`);
    }
    return feed;
}

/**
 * Create a unique key hash based on URL and credentials
 */
export function getKey(wsUrl: string, config: any) {
    const index = new Buffer(`${wsUrl}+${JSON.stringify(config)}`, 'base64');
    return createHmac('sha256', index).digest('base64');
}
