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

import { Product } from '../PublicExchangeAPI';
import { Big } from '../../lib/types';
import { DefaultAPI } from '../../factories/poloniexFactories';
import { Logger } from '../../utils/Logger';
import { PoloniexTicker, PoloniexTickers } from './PoloniexMessages';
import { handleResponse } from '../utils';
import { ProductMap } from '../ProductMap';

export const POLONIEX_WS_FEED = 'wss://api2.poloniex.com';
export const POLONIEX_API_URL = 'https://poloniex.com/public';


/**
 * Takes a Poloniex product name an 'GDAXifies' it, but replacing '_' with '-' and swapping the quote and base symbols
 * @param poloProduct
 */
export function getGenericProduct(poloProduct: string): Product {
    let genericProduct =  ProductMap.ExchangeMap.get('Poloniex').getGenericProduct(poloProduct);
    let genericProductMeta =  ProductMap.ExchangeMap.get('Poloniex').getMarket(genericProduct);
    return {
        id: genericProduct,
        quoteCurrency: genericProductMeta.quote,
        baseCurrency: genericProductMeta.base,
        baseMaxSize: Big(1e6),
        baseMinSize: Big(1e-6),
        quoteIncrement: Big(1e-6)
    };
}

export interface PoloniexProduct extends Product {
    poloniexId: number;
    poloniexSymbol: string;
    isFrozen: boolean;
}

export interface PoloniexProducts { [id: number]: PoloniexProduct; }
let productInfo: PoloniexProducts  = {};

export function getProductInfo(id: number, refresh: boolean, logger?: Logger): Promise<PoloniexProduct> {
    if (!refresh && productInfo[id]) {
        return Promise.resolve(productInfo[id]);
    }
    productInfo = {};
    const req =  DefaultAPI(logger).publicRequest('returnTicker');
    return handleResponse<PoloniexTickers>(req, null).then((tickers: PoloniexTickers) => {
        for (const poloProduct in tickers) {
            const ticker: PoloniexTicker = tickers[poloProduct];
            const product: PoloniexProduct = {
                poloniexId: ticker.id,
                poloniexSymbol: poloProduct,
                isFrozen: ticker.isFrozen === '1',
                ...getGenericProduct(poloProduct)
            };
            productInfo[ticker.id] = product;
        }
        return Promise.resolve(productInfo[id]);
    });
}

export function getAllProductInfo(refresh: boolean, logger?: Logger): Promise<PoloniexProducts> {
    return getProductInfo(0, refresh, logger).then(() => {
        return Promise.resolve(productInfo);
    });
}