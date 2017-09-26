/// <reference types="superagent" />
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
import { Product, PublicExchangeAPI, Ticker } from '../PublicExchangeAPI';
import { AuthenticatedExchangeAPI, Balances } from '../AuthenticatedExchangeAPI';
import { CryptoAddress, ExchangeTransferAPI, TransferRequest, TransferResult, WithdrawalRequest } from '../ExchangeTransferAPI';
import { BookBuilder } from '../../lib/BookBuilder';
import { ExchangeAuthConfig } from '../AuthConfig';
import { Logger } from '../../utils/Logger';
import { BigJS } from '../../lib/types';
import { LiveOrder } from '../../lib/Orderbook';
import { PlaceOrderMessage } from '../../core/Messages';
import superAgent = require('superagent');
export interface PoloniexConfig {
    auth?: ExchangeAuthConfig;
    logger?: Logger;
}
/**
 * An adapter class that maps the standardized API calls to Polinex's API interface
 */
export declare class PoloniexExchangeAPI implements PublicExchangeAPI, AuthenticatedExchangeAPI, ExchangeTransferAPI {
    owner: string;
    auth: ExchangeAuthConfig;
    logger: Logger;
    constructor(config: PoloniexConfig);
    static product(genericProduct: string): string;
    static genericProduct(exchangeProduct: string): string;
    static getMarket(genericProduct: string): any;
    static getMarketForExchangeProduct(exchangeProduct: string): any;
    loadProducts(): Promise<Product[]>;
    placeOrder(order: PlaceOrderMessage): Promise<LiveOrder>;
    cancelOrder(id: string): Promise<string>;
    cancelAllOrders(): Promise<string[]>;
    loadOrder(id: string): Promise<LiveOrder>;
    loadAllOrders(genericProduct: string): Promise<LiveOrder[]>;
    loadBalances(): Promise<Balances>;
    requestCryptoAddress(cur: string): Promise<CryptoAddress>;
    requestTransfer(request: TransferRequest): Promise<TransferResult>;
    requestWithdrawal(request: WithdrawalRequest): Promise<TransferResult>;
    transfer(cur: string, amount: BigJS, from: string, to: string, options: any): Promise<TransferResult>;
    loadMidMarketPrice(genericProduct: string): Promise<BigJS>;
    loadOrderbook(genericProduct: string): Promise<BookBuilder>;
    loadTicker(genericProduct: string): Promise<Ticker>;
    publicRequest(command: string, params?: object): Promise<superAgent.Response>;
    authRequest(command: string, params?: object): Promise<superAgent.Response>;
}
