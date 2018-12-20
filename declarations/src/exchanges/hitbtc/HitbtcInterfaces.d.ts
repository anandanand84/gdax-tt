/***************************************************************************************************************************
 * @license                                                                                                                *
 * Copyright 2017 Coinbase; Inc.                                                                                           *
 *                                                                                                                         *
 * Licensed under the Apache License; Version 2.0 (the "License"); you may not use this file except in compliance          *
 * with the License. You may obtain a copy of the License at                                                               *
 *                                                                                                                         *
 * http://www.apache.org/licenses/LICENSE-2.0                                                                              *
 *                                                                                                                         *
 * Unless required by applicable law or agreed to in writing; software distributed under the License is distributed on     *
 * an "AS IS" BASIS; WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND; either express or implied. See the                      *
 * License for the specific language governing permissions and limitations under the License.                              *
 ***************************************************************************************************************************/
export declare type Side = 'buy' | 'sell';
export declare type TradeMessageType = "snapshotTrades" | "updateTrades";
export declare type OrderbookMessageType = "snapshotOrderbook" | "updateOrderbook";
export interface HitbtcMessage {
    "method": string;
    "params": any;
}
export interface LevelDetails {
    "price": string;
    "size": string;
}
export interface OrderbookSubscriptionRequestMessage extends HitbtcMessage {
    "method": "subscribeOrderbook";
    "params": {
        "symbol": string;
    };
    "id": number;
}
export interface OrderbookResponse extends HitbtcMessage {
    "ask": LevelDetails[];
    "bid": LevelDetails[];
    "symbol": string;
    "sequence": number;
    "timestamp": string;
}
export interface OrderbookResponseMessage extends HitbtcMessage {
    "params": OrderbookResponse;
    "id": number;
}
export interface TradesubscriptionRequestMessage extends HitbtcMessage {
    "params": {
        "symbol": string;
        "limit": number;
    };
    "id": number;
}
export interface TradeMessage {
    "id": number;
    "price": string;
    "quantity": string;
    "side": Side;
    "timestamp": string;
}
export interface TradesubscriptionResponseMessage extends HitbtcMessage {
    "method": TradeMessageType;
    "params": {
        "data": TradeMessage[];
        "symbol": string;
    };
}
