import { HitbtcMarketFeed } from '../exchanges/hitbtc/HitbtcMarketFeed';
import { ExchangeAuthConfig } from '../exchanges/AuthConfig';
import { Logger } from '../utils/Logger';
export declare function getSubscribedFeeds(options: any, symbol: string[]): Promise<HitbtcMarketFeed>;
export declare function FeedFactory(logger: Logger, productIDs: string[], auth?: ExchangeAuthConfig): Promise<HitbtcMarketFeed>;
