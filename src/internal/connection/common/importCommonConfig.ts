import {type CommonConnectionConfig, type RouteOptions, type Userinfo} from '../connection.js';
import {
    getGuardedArrayOfStringsProperty,
    getGuardedBooleanProperty,
    getGuardedNonEmptyStringProperty,
    getGuardedNonNegativeIntegerProperty,
    getGuardedObjectProperty,
    getGuardedPositiveIntegerProperty,
    getGuardedRecordOf,
    getGuardedRecordOfStringsProperty,
    isNonEmptyString,
    isObject
} from '../../guards.js';
import {loadServerSalt} from '../../encryption/utils.js';
import {version as libraryVersion} from '../../../version.js';
import type {LocaleRecord} from '../../translation/translation.js';
import {knownRouteNames} from '../../../HawkiClient.js';

export function createConfigError(message: string, key?: string): Error {
    let errorMessage = message;
    if (key) {
        errorMessage += ` (key: "${key}")`;
    }
    return new Error(`Invalid client configuration: ${errorMessage}`);
}

export function importCommonConfig(raw: any): CommonConnectionConfig {
    return {
        version: importVersion(raw),
        featureFlags: importFeatureFlags(raw),
        locale: importLocale(raw),
        ai: importAiConfig(raw),
        salts: importSalts(raw),
        userinfo: importUserinfo(raw),
        storage: importStorage(raw),
        transfer: importTransfer(raw)
    };
}

export function importVersion(raw: any): CommonConnectionConfig['version'] {
    return {
        hawki: getGuardedNonEmptyStringProperty(raw, 'version', createConfigError),
        client: libraryVersion.version
    };
}

function importFeatureFlags(raw: any): CommonConnectionConfig['featureFlags'] {
    const featureFlags = getGuardedObjectProperty(raw, 'featureFlags', createConfigError);

    const createFeatureFlagsError = (message: string, key: string): Error => {
        return createConfigError(message, `featureFlags.${key}`);
    };

    return {
        aiInGroups: getGuardedBooleanProperty(featureFlags, 'aiInGroups', createFeatureFlagsError)
    };
}

export function importLocale(raw: any): CommonConnectionConfig['locale'] {
    const locale = getGuardedObjectProperty(raw, 'locale', createConfigError);

    const createLocaleError = (message: string, key: string): Error => {
        return createConfigError(message, `locale.${key}`);
    };

    const validateAvailableLocale = (value: any): value is LocaleRecord => {
        return isObject(value)
            && isNonEmptyString(value.lang)
            && isNonEmptyString(value.htmlLang)
            && isNonEmptyString(value.nameInLanguage)
            && isNonEmptyString(value.shortName);
    };

    return {
        default: getGuardedNonEmptyStringProperty(locale, 'default', createLocaleError),
        preferred: getGuardedNonEmptyStringProperty(locale, 'preferred', createLocaleError),
        available: getGuardedRecordOf(
            locale,
            'available',
            validateAvailableLocale,
            createLocaleError
        ) as any as LocaleRecord
    };

}

function importAiConfig(raw: any): CommonConnectionConfig['ai'] {
    const ai = getGuardedObjectProperty(raw, 'ai', createConfigError);

    const createAiInfoError = (message: string, key: string): Error => {
        return createConfigError(message, `ai.${key}`);
    };

    return {
        handle: getGuardedNonEmptyStringProperty(ai, 'handle', createAiInfoError),
        defaultModels: getGuardedRecordOfStringsProperty(ai, 'defaultModels', createAiInfoError) as any,
        systemModels: getGuardedRecordOfStringsProperty(ai, 'systemModels', createAiInfoError) as any
    };
}

function importSalts(raw: any): CommonConnectionConfig['salts'] {
    const salts = getGuardedObjectProperty(raw, 'salts', createConfigError);

    const createSaltError = (message: string, key: string): Error => {
        return createConfigError(message, `salts.${key}`);
    };
    return {
        ai: loadServerSalt(getGuardedNonEmptyStringProperty(salts, 'ai', createSaltError)),
        backup: loadServerSalt(getGuardedNonEmptyStringProperty(salts, 'backup', createSaltError)),
        invitation: loadServerSalt(getGuardedNonEmptyStringProperty(salts, 'invitation', createSaltError)),
        userdata: loadServerSalt(getGuardedNonEmptyStringProperty(salts, 'userdata', createSaltError)),
        passkey: loadServerSalt(getGuardedNonEmptyStringProperty(salts, 'passkey', createSaltError))
    };
}

function importUserinfo(raw: any): Userinfo {
    const userinfo = getGuardedObjectProperty(raw, 'userinfo', createConfigError);

    const createUserinfoError = (message: string, key: string): Error => {
        return createConfigError(message, `userinfo.${key}`);
    };

    return {
        id: getGuardedPositiveIntegerProperty(userinfo, 'id', createUserinfoError),
        username: getGuardedNonEmptyStringProperty(userinfo, 'username', createUserinfoError),
        email: getGuardedNonEmptyStringProperty(userinfo, 'email', createUserinfoError),
        hash: getGuardedNonEmptyStringProperty(userinfo, 'hash', createUserinfoError)
    };
}

function importStorage(raw: any): CommonConnectionConfig['storage'] {
    const storage = getGuardedObjectProperty(raw, 'storage', createConfigError);

    const createStorageError = (message: string, key: string): Error => {
        return createConfigError(message, `storage.${key}`);
    };

    return {
        allowedAvatarMimeTypes: getGuardedArrayOfStringsProperty(storage, 'allowedAvatarMimeTypes', createStorageError),
        allowedMimeTypes: getGuardedArrayOfStringsProperty(storage, 'allowedMimeTypes', createStorageError),
        maxAttachmentFiles: getGuardedNonNegativeIntegerProperty(storage, 'maxAttachmentFiles', createStorageError),
        maxAvatarFileSize: getGuardedNonNegativeIntegerProperty(storage, 'maxAvatarFileSize', createStorageError),
        maxFileSize: getGuardedNonNegativeIntegerProperty(storage, 'maxFileSize', createStorageError)
    };
}

function importTransfer(raw: any): CommonConnectionConfig['transfer'] {
    const transfer = getGuardedObjectProperty(raw, 'transfer', createConfigError);

    const createTransferError = (message: string, key: string): Error => {
        return createConfigError(message, `transfer.${key}`);
    };

    const createWebsocketError = (message: string, key: string): Error => {
        return createTransferError(message, `websocket.${key}`);
    };

    const websocket = getGuardedObjectProperty(transfer, 'websocket', createTransferError);

    const allowedRouteMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
    const isValidRouteOptions = (value: any): value is RouteOptions => {
        return !(!isObject(value)
            || !isNonEmptyString(value.route)
            || !allowedRouteMethods.includes(value.method));
    };
    const routes = getGuardedRecordOf(transfer, 'routes', isValidRouteOptions, createTransferError) as CommonConnectionConfig['transfer']['routes'];
    const routeKeys = Object.keys(routes);
    for (const expectedKey of knownRouteNames) {
        if (!routeKeys.includes(expectedKey)) {
            throw createTransferError(`Missing route "${expectedKey}" in "routes"`, 'routes');
        }
    }

    return {
        baseUrl: getGuardedNonEmptyStringProperty(transfer, 'baseUrl', createTransferError),
        routes: routes,
        websocket: {
            key: getGuardedNonEmptyStringProperty(websocket, 'key', createWebsocketError),
            host: getGuardedNonEmptyStringProperty(websocket, 'host', createWebsocketError),
            port: getGuardedPositiveIntegerProperty(websocket, 'port', createWebsocketError),
            forceTLS: getGuardedBooleanProperty(websocket, 'forceTLS', createWebsocketError)
        }
    };
}
