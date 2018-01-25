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
import { ExchangeAuthConfig } from '../AuthConfig';
import { Logger } from '../../utils/Logger';
import { ExchangeFeedConfig } from '../ExchangeFeed';
export interface BinanceConfig {
    apiUrl?: string;
    auth?: ExchangeAuthConfig;
    logger: Logger;
}
export interface BinanceFeedConfig extends ExchangeFeedConfig {
    products: string[];
}
export interface BinanceMessage {
    e: string;
    E: number;
    s: string;
}
export interface BinanceTradeMessage extends BinanceMessage {
    t: number;
    p: string;
    q: string;
    b: number;
    a: number;
    T: number;
    m: true;
    M: true;
}
export interface BinanceDepthMessage extends BinanceMessage {
    "U": number;
    "u": number;
    "b": any[];
    "a": any[];
}
export interface BinanceSnapshotMessage extends BinanceMessage {
    lastUpdateId: number;
    s: string;
    bids: any[];
    asks: any[];
}
