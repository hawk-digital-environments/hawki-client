import type {
    ExternalConnection,
    ExternalConnectionConfig,
    ExternalConnectOptions
} from '../connection.js';
import type {Logger} from '../../logger.js';
import {createConnection} from '../createConnection.js';
import type {EventBus} from '../../events/EventBus.js';
import {createTransferHandle} from '../transfer/TransferHandle.js';
import {type ConnectRequestConfig, loadExternalConfig} from './loadExternalConfig.js';
import {createClientLocale} from '../../translation/clientLocale.js';

export async function connectExternal(
    eventBus: EventBus,
    options: ExternalConnectOptions,
    log: Logger,
    bootLog: Logger
): Promise<ExternalConnection> {
    bootLog = bootLog.withPrefix('External Connection');
    let config: ExternalConnectionConfig | ConnectRequestConfig;
    while (true) {
        config = await loadExternalConfig(options, bootLog);

        if (config.connectionType === 'connected') {
            break;
        }

        if (config.connectionType === 'connect_request') {
            if (typeof options.onConnectionRequired !== 'function') {
                throw new Error('The "onConnectionRequired" function is required to connect your external client to a HAWKI server');
            }

            // Automatically inject the locale into the connection URL
            // This allows the server to serve localized content during the connection process
            // without requiring additional configuration from the user
            // The locale used here is the one that will be used for the connection once established
            // so it should match the user's preferences as closely as possible
            // If no locale is provided in options, the default locale from config will be used
            // which is typically set by the server or falls back to the configured one in the HTML page
            const clientLocale = createClientLocale(log, config, options.locale);
            let connectUrl = config.connectUrl;
            const url = new URL(connectUrl);
            url.searchParams.set('lang', clientLocale.get().lang);
            connectUrl = url.toString();

            const result = options.onConnectionRequired(connectUrl);
            if (!(result instanceof Promise)) {
                throw new Error('The "onConnectionRequired" function must return a Promise that resolves when the connection is established');
            }
            await result;
        }
    }

    bootLog.info('Creating external connection with config', config);

    const {
        secrets: {passkey, apiToken},
        transfer: {baseUrl}
    } = config;

    const locale = createClientLocale(log, config, options.locale);

    const transfer = createTransferHandle(
        config,
        locale,
        {
            'Authorization': `bearer ${apiToken}`
        },
        log,
        eventBus,
        {
            authEndpoint: baseUrl + '/api/broadcasting/auth',
            auth: {
                headers: {
                    'Access-Control-Allow-Origin': '*'
                }
            }
        }
    );

    return createConnection<ExternalConnection>(
        config,
        passkey,
        locale,
        eventBus,
        log,
        transfer
    );
}
