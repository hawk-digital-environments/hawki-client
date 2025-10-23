import type {TransferFetch, TransferFetchOptions} from './transferFetch.js';
import type {TransferRoute} from '../connection.js';
import type {Logger} from '../../logger.js';

export function createBlobFetchWrapper(
    transferFetch: TransferFetch,
    log: Logger
) {
    log = log.withPrefix('BLOB').withPrefix();

    return async (
        path: TransferRoute,
        options?: TransferFetchOptions
    ) => {

        const response = await transferFetch(path, {
            method: 'GET',
            ...options,
            log: options?.log || log
        });

        return response.blob();
    };
}
