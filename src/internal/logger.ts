export interface Logger {
    debug(...args: any[]): void;

    error(...args: any[]): void;

    warning(...args: any[]): void;

    info(...args: any[]): void;

    /**
     * Creates a new logger that prefixes all messages with the given prefix.
     * Can be called multiple times to create nested prefixes.
     * @param prefix The prefix to add to all messages. If not provided or empty, a random 6-character string will be used.
     * @returns A new Logger instance with the specified prefix.
     */
    withPrefix(prefix?: string): Logger;
}

export function createDebugLogger(): Logger {
    return {
        debug: (...args: any[]) => console.debug(...args),
        error: (...args: any[]) => console.error(...args),
        warning: (...args: any[]) => console.warn(...args),
        info: (...args: any[]) => console.info(...args),
        withPrefix: (prefix?: string) => {
            return createPrefixedLogger(`[${createRayIfEmpty(prefix)}]`, createDebugLogger());
        }
    };
}

export function createSilentLogger(): Logger {
    return {
        debug: () => void 0,
        error: () => void 0,
        warning: () => void 0,
        info: () => void 0,
        withPrefix: () => createSilentLogger()
    };
}

function createPrefixedLogger(prefix: string, baseLogger: Logger): Logger {
    return {
        debug: (...args: any[]) => baseLogger.debug(prefix, ...args),
        error: (...args: any[]) => baseLogger.error(prefix, ...args),
        warning: (...args: any[]) => baseLogger.warning(prefix, ...args),
        info: (...args: any[]) => baseLogger.info(prefix, ...args),
        withPrefix: (newPrefix: string) => createPrefixedLogger(`${prefix}[${createRayIfEmpty(newPrefix)}]`, baseLogger)
    };
}

function createRayIfEmpty(value: string | undefined) {
    return value && value.length > 0 ? value : Math.random().toString(36).substring(2, 8).toUpperCase();
}
