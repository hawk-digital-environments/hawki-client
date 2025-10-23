import type {InternalConnectionConfig, InternalConnectOptions} from '../connection.js';
import type {Logger} from '../../logger.js';
import {getGuardedNonEmptyStringProperty, getGuardedObjectProperty, isObject} from '../../guards.js';
import {createConfigError, importCommonConfig} from '../common/importCommonConfig.js';

/**
 * Loads the internal connection configuration from a <script> tag in the HTML document.
 * The <script> tag must have type="application/json" and contain the configuration as JSON.
 * The default selector is '#frontend-connection', but can be overridden via options.
 * After loading the JSON, it is validated and parsed into an InternalConnectionConfig object.
 * @param options
 * @param log
 */
export function loadInternalConfig(options: InternalConnectOptions, log: Logger) {
    log.info('Loading client configuration for internal connection');

    const connectionSelector = options.connectionSelector || '#frontend-connection';
    const element = document.querySelector(connectionSelector);
    if (!element) {
        throw new Error(`Failed to find connection configuration element using selector: ${connectionSelector}`);
    }

    if (element.tagName !== 'SCRIPT') {
        throw new Error('The connection configuration element must be a <script> tag, found <${element.tagName.toLowerCase()}> instead');
    }

    if (element.getAttribute('type') !== 'application/json') {
        throw new Error('The connection configuration <script> tag must have type="application/json"');
    }

    const jsonText = element.textContent;
    if (!jsonText) {
        throw new Error('The connection configuration <script> tag is empty');
    }

    const parsed = JSON.parse(jsonText);

    log.info('Successfully resolved client configuration for internal connection');

    try {
        return importInternalConfig(parsed);
    } catch (error) {
        log.error('Error while importing client configuration', error);
        throw error;
    }
}

function importInternalConfig(raw: any): InternalConnectionConfig {
    if (!isObject(raw)) {
        throw new Error('Invalid client configuration: must be an object');
    }

    const commonConfig = importCommonConfig(raw);

    return {
        type: 'internal',
        ...commonConfig,
        secrets: importInternalSecrets(raw)
    };
}

function importInternalSecrets(raw: any): InternalConnectionConfig['secrets'] {
    const secrets = getGuardedObjectProperty(raw, 'secrets', createConfigError);

    const createSecretsError = (message: string, key: string): Error => {
        return createConfigError(message, `secrets.${key}`);
    };

    return {
        csrfToken: getGuardedNonEmptyStringProperty(secrets, 'csrfToken', createSecretsError)
    };
}
