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
import { RedisBookBuilder } from '../lib/RedisBookBuilder';
import { Orderbook } from '../lib';
import { LiveBookConfig, LiveOrderbook } from './';

export class RedisBookConfig extends LiveBookConfig {
    exchange: string
}

export class RedisBook extends LiveOrderbook implements Orderbook {

    protected _book: RedisBookBuilder;

    constructor(config: RedisBookConfig) {
        super(config);
        this._book = new RedisBookBuilder(config.exchange, config.product, config.logger);
    }
}
