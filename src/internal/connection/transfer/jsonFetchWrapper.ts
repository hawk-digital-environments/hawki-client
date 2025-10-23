import type {TransferFetch, TransferFetchOptions} from './transferFetch.js';
import type {Logger} from '../../logger.js';
import type {EventBus} from '../../events/EventBus.js';
import type {TransferRoute} from '../connection.js';

export function createJsonFetchWrapper(
    transferFetch: TransferFetch,
    log: Logger,
    eventBus: EventBus
) {
    log = log.withPrefix('JSON').withPrefix();
    return async <R>(
        path: TransferRoute,
        body?: object,
        options?: TransferFetchOptions
    ): Promise<R> => {
        options = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options?.headers
            },
            log: options?.log || log
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await transferFetch(path, options);
        log.debug(`Response from (${response.requestMethod}) ${path}: ${response.status} ${response.statusText} ${response.ok ? 'OK' : 'Error'}`);

        response.bodyUsed;
        let data = null;
        let responseText = '';
        try {
            responseText = await response.text();
            if (!responseText) {
                log.debug(`Empty response body from ${response.requestMethod} ${path}`);
                return data as R;
            }

            data = JSON.parse(responseText);
        } catch (error) {
            if (responseText) {
                throw new Error(`Failed to parse JSON response from ${response.requestMethod} ${path}: ${error} - Response text: ${responseText}`);
            }
            throw error;
        }

        log.debug(`Data received from (${response.requestMethod}) ${path}:`, data);
        if (typeof data === 'object' && !Array.isArray(data) && data !== null) {
            if (typeof data.success !== 'undefined' && !data.success) {
                throw new Error(response.requestMethod + ' Operation failed: ' + (data.message || 'No details provided'));
            }

            if (typeof data['_hawki_sync_log'] === 'object') {
                eventBus.dispatchSyncLogInResponseEvent(data['_hawki_sync_log']);
            }
        }

        return data as R;
    };
}
