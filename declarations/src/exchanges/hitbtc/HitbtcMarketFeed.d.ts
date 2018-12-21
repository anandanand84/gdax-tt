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
import { ExchangeFeed, ExchangeFeedConfig } from '../ExchangeFeed';
export declare class HitbtcMarketFeed extends ExchangeFeed {
    readonly owner: string;
    readonly feedUrl: string;
    private counters;
    private orderIdMap;
    private seq;
    private requestId;
    static product(genericProduct: string): string;
    static genericProduct(exchangeProduct: string): string;
    static getMarket(genericProduct: string): any;
    static getMarketForExchangeProduct(exchangeProduct: string): any;
    constructor(config: ExchangeFeedConfig);
    private nextSequence(product);
    private setSnapshotSequence(product, sequence);
    private getSnapshotSequence(product);
    subscribe(productIds: string[]): Promise<boolean>;
    protected onOpen(): void;
    protected handleMessage(rawMsg: string): void;
    private handleSnapshot(snapshot);
    private handleOrderbookUpdate(updates);
    private handleTrade(trades);
}