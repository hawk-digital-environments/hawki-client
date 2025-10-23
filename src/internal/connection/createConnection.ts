import type {Connection, ConnectionConfig} from './connection.js';
import type {Logger} from '../logger.js';
import type {EventBus} from '../events/EventBus.js';
import {type HawkiClient} from '../../HawkiClient.js';
import type {TransferHandle} from './transfer/TransferHandle.js';
import {createKeychainHandle, type KeychainHandle} from '../encryption/keychain/KeychainHandle.js';
import {createResourceDb, type ResourceDb} from '../resources/db/ResourceDb.js';
import type {ClientLocale} from '../translation/clientLocale.js';
import {createFeatureFlags} from '../features/FeatureFlags.js';

export function createConnection<T extends Connection>(
    fullConfig: ConnectionConfig,
    passkey: string,
    locale: ClientLocale,
    eventBus: EventBus,
    log: Logger,
    transfer: TransferHandle,
    additionalAttributes?: Partial<T>
): T {
    const type = fullConfig.type;

    const features: Connection['features'] = new Map();
    const featureFlags = createFeatureFlags(fullConfig.featureFlags);

    const client = new Proxy(
        {
            get connected() {
                return transfer.connected;
            },
            async disconnect(clear?: boolean) {
                log.info(`Disconnecting from ${type} connection`);
                await eventBus.dispatchDisconnect(clear);
                features.clear();
            }
        } as any as HawkiClient,
        {
            get(target, prop, receiver) {
                if (prop in target) {
                    return Reflect.get(target, prop, receiver);
                }
                if (!transfer.connected.get()) {
                    throw new Error('HAWKI client is not connected');
                }
                if (features.has(prop as any)) {
                    return features.get(prop as any);
                }
                return undefined;
            }
        }
    );

    let resourceDb: ResourceDb;
    let keychain: KeychainHandle;

    const connection: Connection = {
        ...(additionalAttributes ?? {}),
        get connected() {
            return transfer.connected;
        },
        locale,
        client,
        features,
        featureFlags,
        eventBus,
        type,
        log,
        transfer,
        get resourceDb() {
            return resourceDb;
        },
        get keychain() {
            return keychain;
        },
        userinfo: {
            ...fullConfig.userinfo
        },
        config: {
            ...fullConfig,
            secrets: undefined
        } as any
    };

    resourceDb = createResourceDb(connection);
    keychain = createKeychainHandle(connection, passkey);

    return connection as T;
}
