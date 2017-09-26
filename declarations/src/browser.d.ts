/// <reference types="node" />
import { LiveOrderbook } from './core';
import { Readable } from 'stream';
export declare class SocketIOReadStream extends Readable {
    constructor();
    _read(size: number): void;
}
export declare function subscribeBook(product: any): LiveOrderbook;
export declare function unsubscribeBook(product: string): void;
export default subscribeBook;
