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
import { ProductMap } from '../exchanges/ProductMap';
import { GeminiMarketFeed } from '../exchanges/gemini/GeminiMarketFeed';
import { ExchangeAuthConfig } from '../exchanges/AuthConfig';
import * as GI from '../exchanges/gemini/GeminiInterfaces';
import { Logger } from '../utils/Logger';
import { getFeed } from '../exchanges/ExchangeFeed';

function getExchangeProduct(genericProduct:string):string {
    return ProductMap.ExchangeMap.get('Gemini').getExchangeProduct(genericProduct);
}

export const GEMINI_API_URL = 'https://api.gemini.com/v1';
export const GEMINI_WS_FEED = 'wss://api.gemini.com/v1/marketdata/';

export function getSubscribedFeeds(options: any, symbol: string[]): Promise<GeminiMarketFeed> {
    return new Promise((resolve, reject) => {
        const config: GI.GeminiMarketFeedConfig = {
            wsUrl: null, //Used in connect
            auth: null,
            logger: options.logger,
            products: symbol
        };
        const feed = getFeed<GeminiMarketFeed, GI.GeminiMarketFeedConfig>(GeminiMarketFeed, config);
        if (!feed.isConnected()) {
            feed.reconnect(0);
            feed.on('websocket-open', () => {
                return resolve(feed);
            });
        } else {
            return resolve(feed);
        }
    });
}

export function FeedFactory(logger: Logger, productIDs: string[], auth?: ExchangeAuthConfig): Promise<GeminiMarketFeed> {
    auth = auth || {
        key: process.env.GEMINI_KEY,
        secret: process.env.GEMINI_SECRET
    };
    productIDs = productIDs.map((genericProduct: string) => {
        return getExchangeProduct(genericProduct) || genericProduct;
    });
    return getSubscribedFeeds({ auth: auth, logger: logger }, productIDs)
    .catch((err) => {
        if (logger) {
            logger.error(err);
        } else {
            console.error(err);
        }
        return null;
    });
}
