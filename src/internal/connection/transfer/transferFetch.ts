import type {TransferUrlBuilder, TransferUrlOptions} from './urlBuilder.js';
import type {Logger} from '../../logger.js';
import type {TransferRoute} from '../connection.js';
import type {ClientLocale} from '../../translation/clientLocale.js';

export type TransferFetch = ReturnType<typeof createTransferFetch>;

export type TransferFetchOptions = RequestInit & TransferUrlOptions & { log?: Logger };

export function createTransferFetch(
    authenticationHeaders: RequestInit['headers'],
    isConnected: () => boolean,
    buildUrl: TransferUrlBuilder,
    log: Logger,
    locale: ClientLocale,
    fetchImplementation: typeof fetch = fetch
) {
    return async (
        path: TransferRoute,
        options: TransferFetchOptions = {}
    ) => {
        log = options.log ?? log;

        if (!isConnected()) {
            throw new Error('The connection has been closed, you can not use the fetch handle anymore.');
        }

        // noinspection SuspiciousTypeOfGuard
        if (typeof path !== 'string') {
            throw new Error('The provided path must be a string!');
        }

        const url = buildUrl(path, options);
        const method = options.method ?? url.method ?? 'GET';

        const combinedOptions: RequestInit = {
            method,
            ...options,
            headers: {
                ...authenticationHeaders,
                ...options.headers,
                'X-App-Locale': locale.get()?.lang || 'de_DE'
            }
        };

        log.debug(`Fetching ${url} with options:`, combinedOptions);

        let errorMessage = '';
        const addToError = (msg: string) => {
            if (!errorMessage) {
                errorMessage = `Error while requesting ${method} ${url}: `;
            }
            errorMessage += msg;
        };

        try {
            const response: Response & {
                requestMethod: string
            } = await fetchImplementation(url, combinedOptions) as any;
            response.requestMethod = method;

            log.debug(`Response from ${method} ${url}: ${response.status} ${response.statusText} ${response.ok ? 'OK' : 'Error'}`);

            if (!response.ok) {
                addToError(`Server responded with status ${response.status} ${response.statusText ? `(${response.statusText}` : ''}. `);
                try {
                    const errorData = await response.json();

                    // Special handling for validation errors
                    if (response.status === 422 && !!errorData.errors) {
                        log.error('Validation errors received from server:', errorData.errors);
                    }

                    if (errorData.error) {
                        addToError(`- ${errorData.error} `);
                    }

                    if (errorData.message) {
                        addToError(`-  ${errorData.message} `);
                    }
                } catch (e) {
                }
            }

            if (!errorMessage) {
                return response;
            }
        } catch (e) {
            addToError(`Caught error: ${(e instanceof Error) ? e.message : String(e)} `);
        }

        throw new Error(errorMessage.trim());
    };
}
