import { ProductMap } from '../exchanges/ProductMap';
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

import { Logger } from '../utils/Logger';
import { BinanceFeed } from '../exchanges/binance/BinanceFeed';
import { ExchangeFeedConfig } from '../exchanges/ExchangeFeed';
import { ExchangeAuthConfig } from '../exchanges/AuthConfig';


function getExchangeProduct(genericProduct:string):string {
    return ProductMap.ExchangeMap.get('Binance').getExchangeProduct(genericProduct);
}


/**
 * Convenience function to connect to and subscribe to the given channels. Binance uses SignalR, which handles reconnects for us,
 * so this is a much simpler function than some of the other exchanges' methods.
 */
export function getSubscribedFeeds(options: ExchangeFeedConfig, products: string[]): Promise<BinanceFeed> {
    return new Promise((resolve, reject) => {
        const feed: BinanceFeed = new BinanceFeed(options);
        const timeout = setTimeout(() => {
            return reject(new Error('TIMEOUT. Could not connect to Binance Feed server'));
        }, 30000);
        feed.on('websocket-connection', () => {
            feed.subscribe(products);
            clearTimeout(timeout);
            return resolve(feed);
        });
    });
}

/**
 * This is a straightforward wrapper around getSubscribedFeeds using the Factory pattern with the most commonly used
 * defaults. For customised feeds, use getSubscribedFeeds instead. It's really not adding much, but we keep it here
 * to maintain a consistent method naming strategy amongst all the exchanges
 *
 * It is assumed that your API keys are stored in the BINANCE_KEY and BINANCE_SECRET envars
 */
export function FeedFactory(logger: Logger, productIds: string[], auth?: ExchangeAuthConfig): Promise<BinanceFeed> {
    auth = auth || {
        key: process.env.BINANCE_KEY,
        secret: process.env.BINANCE_SECRET
    };
    productIds = productIds.map((genericProduct: string) => {
        console.log('Product ID', genericProduct);
        return getExchangeProduct(genericProduct) || genericProduct;
    });
    // There are too many books on BINANCE to just subscribe to all of them, so productIds is a required param
    return getSubscribedFeeds({ auth: auth, logger: logger, wsUrl: null }, productIds);
}
