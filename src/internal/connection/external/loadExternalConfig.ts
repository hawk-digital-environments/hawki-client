import type {
    CommonConnectionConfig,
    ExternalConnectionConfig,
    ExternalConnectOptions
} from '../connection.js';
import type {Logger} from '../../logger.js';
import {exportPublicKeyToString, generateAsymmetricKeyPair} from '../../encryption/asymmetric.js';
import {decryptHybrid, loadHybridCryptoValue} from '../../encryption/hybrid.js';
import {
    createConfigError,
    importCommonConfig,
    importLocale,
    importVersion
} from '../common/importCommonConfig.js';
import {getGuardedNonEmptyStringProperty, getGuardedObjectProperty, isObject} from '../../guards.js';

export interface ConnectRequestConfig {
    connectionType: 'connect_request';
    version: CommonConnectionConfig['version'];
    locale: CommonConnectionConfig['locale'];
    connectUrl: string;
}

export async function loadExternalConfig(options: ExternalConnectOptions, log: Logger) {
    log = log.withPrefix('loadExternalConfig');
    log.info('Loading client configuration for external connection');

    let useClientConfigUrl = false;
    let loadClientConfig: ExternalConnectOptions['loadClientConfig'] | null = options.loadClientConfig || null;

    if (typeof options.clientConfigUrl === 'string') {
        useClientConfigUrl = true;
        if (loadClientConfig !== null) {
            log.warning('Both "clientConfigUrl" and "loadClientConfig" are provided in options, "clientConfigUrl" will be used');
        }

        loadClientConfig = async (publicKey: string) => {
            const result = await (await fetch(options.clientConfigUrl as string, {
                method: 'POST',
                body: (() => {
                    const formData = new FormData();
                    formData.append('public_key', publicKey);
                    return formData;
                })()
            })).json();

            if (result.error) {
                log.error('Failed to load client configuration from URL:', result.error);
                throw new Error(`Failed to load client configuration from URL: ${result.error}`);
            }

            return result;
        };
    }

    if (typeof loadClientConfig !== 'function') {
        throw new Error('The "loadClientConfig" function or "clientConfigUrl" are required to connect an external client to a HAWKI server');
    }

    const keypair = await generateAsymmetricKeyPair();
    const publicKey = await exportPublicKeyToString(keypair.publicKey);

    if (useClientConfigUrl) {
        log.debug(`Starting to load client configuration from URL: ${options.clientConfigUrl}`);
    } else {
        log.debug('Starting to load client configuration using the provided "loadClientConfig" function');
    }

    const result = await loadClientConfig(publicKey);

    if (!result || typeof result !== 'object' || !result.hawkiClientConfig) {
        log.error('Failed to load a valid client configuration', result);
        if (useClientConfigUrl) {
            throw new Error(`The configured "clientConfigUrl" did not return a valid client configuration from URL: ${options.clientConfigUrl}`);
        }
        throw new Error('The "loadClientConfig" function must return an object with a "hawkiAppConfig" property');
    }

    log.debug('Successfully loaded client configuration, starting decryption');

    const decryptedConfig = await decryptHybrid(
        loadHybridCryptoValue(result.hawkiClientConfig),
        keypair.privateKey
    );

    log.debug('Decryption of client configuration completed successfully');

    const parsed = JSON.parse(decryptedConfig);

    log.debug('Successfully resolved client configuration for external connection');

    try {
        log.debug('Starting to import external client configuration', parsed);
        return importExternalConfig(parsed);
    } catch (error) {
        log.error('Failed to import external client configuration:', error);
        throw error;
    }
}

function importExternalConfig(raw: any): ExternalConnectionConfig | ConnectRequestConfig {
    if (!isObject(raw)) {
        throw new Error('Invalid client configuration: must be an object');
    }

    const payload: any = getGuardedObjectProperty(raw, 'payload', createConfigError);

    if (raw.type === 'connected') {
        return importConnectedConfig(payload);
    } else if (raw.type === 'connect_request') {
        return importConnectRequestConfig(payload);
    }

    throw new Error('Invalid client configuration: "type" must be "connect_request" or "connected"');
}

function importConnectRequestConfig(raw: any): ConnectRequestConfig {
    const createConnectRequestError = (message: string, key: string): Error => {
        return createConfigError(`for "connect_request" config: ${message}`, key);
    };

    return {
        connectionType: 'connect_request',
        version: importVersion(raw),
        locale: importLocale(raw),
        connectUrl: getGuardedNonEmptyStringProperty(raw, 'connectUrl', createConnectRequestError)
    };
}

function importConnectedConfig(raw: any): ExternalConnectionConfig {
    const commonConfig = importCommonConfig(raw);

    return {
        type: 'external',
        connectionType: 'connected',
        ...commonConfig,
        secrets: importExternalSecrets(raw)
    };
}

function importExternalSecrets(raw: any): ExternalConnectionConfig['secrets'] {
    const secrets = getGuardedObjectProperty(raw, 'secrets', createConfigError);

    const createSecretsError = (message: string, key: string): Error => {
        return createConfigError(message, `secrets.${key}`);
    };

    return {
        apiToken: getGuardedNonEmptyStringProperty(secrets, 'apiToken', createSecretsError),
        passkey: getGuardedNonEmptyStringProperty(secrets, 'passkey', createSecretsError)
    };
}
