import type {Logger} from '../../logger.js';
import type {EventBus} from '../../events/EventBus.js';
import type {CommonConnectionConfig, TransferRoute} from '../connection.js';
import {createUrlBuilder} from './urlBuilder.js';
import {createJsonFetchWrapper} from './jsonFetchWrapper.js';
import {createTransferFetch, type TransferFetchOptions} from './transferFetch.js';
import {createBlobFetchWrapper} from './blobFetchWrapper.js';
import {createFileUploadHandler} from './uploadFile.js';
import Echo, {type EchoOptions} from 'laravel-echo';
import Pusher from 'pusher-js';
import {createGenericStore} from '../../resources/stores/GenericStore.js';
import {createStoreFront} from '../../resources/stores/ReactiveStoreFront.js';
import {bindWebsocketEvents} from '../../events/websockets.js';
import type {ClientLocale} from '../../translation/clientLocale.js';

export type TransferHandle = ReturnType<typeof createTransferHandle>;

export function createTransferHandle(
    config: CommonConnectionConfig,
    locale: ClientLocale,
    authenticationHeaders: Record<string, string>,
    log: Logger,
    eventBus: EventBus,
    websocketConfigOverride?: Partial<EchoOptions<'reverb'>>,
    fetchImplementation: typeof fetch = fetch
) {
    log = log.withPrefix('Transfer');
    const connectedStoreFront = createStoreFront(() => createGenericStore(true));
    const isConnected = () => connectedStoreFront.get();

    const {transfer: {baseUrl, routes, websocket}, userinfo} = config;

    const buildUrl = createUrlBuilder(baseUrl, routes);

    const fetchRaw = createTransferFetch(
        authenticationHeaders,
        isConnected,
        buildUrl,
        log,
        locale,
        fetchImplementation
    );

    const fetchJson = createJsonFetchWrapper(
        fetchRaw,
        log,
        eventBus
    );

    const fetchBlob = createBlobFetchWrapper(
        fetchRaw,
        log
    );

    const upload = createFileUploadHandler(
        authenticationHeaders,
        isConnected,
        buildUrl,
        log,
        eventBus
    );

    const echo = new Echo({
        broadcaster: 'reverb',
        key: websocket.key || 'hawki2',
        wsHost: websocket.host,
        wsPort: websocket.port,
        forceTLS: websocket.forceTLS,
        enabledTransports: ['ws', 'wss'],
        ...websocketConfigOverride,
        auth: {
            ...websocketConfigOverride?.auth,
            headers: {
                ...authenticationHeaders,
                ...(websocketConfigOverride?.auth?.headers || {}),
                'X-App-Locale': locale.get()?.lang || 'de_DE'
            }
        },
        Pusher
    });

    eventBus.onDisconnect(() => {
        connectedStoreFront.store().set(false);
        echo.disconnect();
    }, eventBus.HIGHEST_PRIORITY);

    bindWebsocketEvents(log, userinfo, echo, eventBus);

    const requestJsonWith = async <R = any>(
        path: TransferRoute | string,
        body: object | undefined,
        options?: Omit<TransferFetchOptions, 'body'>
    ) => {
        return fetchJson<R>(path, body, options);
    };

    const requestJson = async <R = any>(
        path: TransferRoute | string,
        options?: Omit<TransferFetchOptions, 'body'>
    ) => {
        return requestJsonWith<R>(path, undefined, options);
    };

    const requestBlob = async (path: TransferRoute, options?: TransferFetchOptions) =>
        fetchBlob(path, options);

    return {
        get connected() {
            return connectedStoreFront;
        },
        requestJsonWith,
        requestJson,
        requestBlob,
        upload,
        raw: fetchRaw,
        echo
    };
}
