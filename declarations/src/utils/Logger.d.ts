export interface Logger {
    log(level: string, message: string, meta?: any): void;
    error(err: Error): void;
}
export declare function ConsoleLoggerFactory(options?: any): Logger;
export declare const NullLogger: {
    log(level: string, message: string, meta?: any): void;
    error(err: Error): void;
};
