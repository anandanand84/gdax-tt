import { BitmexMarketFeed } from '../exchanges/bitmex/BitmexMarketFeed';
import { ExchangeAuthConfig } from '../exchanges/AuthConfig';
import { Logger } from '../utils/Logger';
export declare function getSubscribedFeeds(options: any, symbol: string[]): Promise<BitmexMarketFeed>;
export declare function FeedFactory(logger: Logger, productIDs: string[], auth?: ExchangeAuthConfig): Promise<BitmexMarketFeed>;
