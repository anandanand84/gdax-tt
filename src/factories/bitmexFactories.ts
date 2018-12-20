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
import { BitmexMarketFeed } from '../exchanges/bitmex/BitmexMarketFeed';
import { ExchangeAuthConfig } from '../exchanges/AuthConfig';
import { Logger } from '../utils/Logger';
import { getFeed, ExchangeFeedConfig } from '../exchanges/ExchangeFeed';

function getExchangeProduct(genericProduct:string):string {
    return ProductMap.ExchangeMap.get('Bitmex').getExchangeProduct(genericProduct);
}


export function getSubscribedFeeds(options: any, symbol: string[]): Promise<BitmexMarketFeed> {
    return new Promise((resolve, reject) => {
        const config: ExchangeFeedConfig = {
            wsUrl: null, //Used in connect
            auth: null,
            logger: options.logger,
        };
        const feed = getFeed<BitmexMarketFeed, ExchangeFeedConfig>(BitmexMarketFeed, config);
        if (!feed.isConnected()) {
            feed.reconnect(0);
            feed.on('websocket-open', () => {
                feed.subscribe(symbol).then(() => {
                    return resolve(feed);
                }).catch((err:any) => {
                        console.log('error', 'A websocket connection to Bitmex was established, but product subscription failed.', { reason: err.message });
                    return reject(err);
                });
                return resolve(feed);
            });
        } else {
            return resolve(feed);
        }
    });
}

export function FeedFactory(logger: Logger, productIDs: string[], auth?: ExchangeAuthConfig): Promise<BitmexMarketFeed> {
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
