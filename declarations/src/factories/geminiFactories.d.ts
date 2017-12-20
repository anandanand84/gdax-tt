import { GeminiMarketFeed } from '../exchanges/gemini/GeminiMarketFeed';
import { ExchangeAuthConfig } from '../exchanges/AuthConfig';
import { Logger } from '../utils/Logger';
export declare const GEMINI_API_URL = "https://api.gemini.com/v1";
export declare const GEMINI_WS_FEED = "wss://api.gemini.com/v1/marketdata/";
export declare function getSubscribedFeeds(options: any, symbol: string[]): Promise<GeminiMarketFeed>;
export declare function FeedFactory(logger: Logger, productIDs: string[], auth?: ExchangeAuthConfig): Promise<GeminiMarketFeed>;
