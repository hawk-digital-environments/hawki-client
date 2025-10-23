import type {
    InternalConnectionConfig,
    InternalConnectOptions,
    ProvidePasskeyHelpers
} from '../connection.js';
import type {Logger} from '../../logger.js';
import {
    decryptSymmetric,
    loadSymmetricCryptoValue,
    loadSymmetricCryptoValueFromJson
} from '../../encryption/symmetric.js';
import {deriveKeychainPassword} from '../../encryption/keychain/KeychainHandle.js';
import type {TransferHandle} from '../transfer/TransferHandle.js';
import {deriveKey} from '../../encryption/utils.js';

export async function resolvePasskey(
    transfer: TransferHandle,
    config: InternalConnectionConfig,
    options: InternalConnectOptions,
    log: Logger
): Promise<string> {
    log = log.withPrefix('Passkey Resolver');
    if (typeof options.providePasskey !== 'function') {
        throw new Error('The "providePasskey" function is required to connect an internal client to a HAWKI server');
    }

    const passkeyValidator = await fetchPasskeyValidator(transfer);
    if (!passkeyValidator) {
        throw new Error('Failed to fetch passkey validator from server, cannot validate passkey');
    }

    const validatePasskey = async (passKey: string) => {
        try {
            JSON.parse(
                await decryptSymmetric(
                    passkeyValidator,
                    await deriveKeychainPassword(config, passKey)
                )
            );
            return true;
        } catch (error) {
            return false;
        }
    };

    const backupHashToKey = async (backupHash: string) => {
        try {
            if (!validateBackupHashFormat(backupHash)) {
                log.error('The provided backup hash is not in the correct format');
                return null;
            }

            const encryptedBackupPasskey = await fetchBackupPasskey(transfer);
            if (!encryptedBackupPasskey) {
                log.error('No backup passkey is available on the server');
                return null;
            }

            const derivedKey = await deriveKey(backupHash, `${config.userinfo.username}_backup`, config.salts.backup);

            let decryptedPasskey: string;
            try {
                decryptedPasskey = await decryptSymmetric(encryptedBackupPasskey, derivedKey);
            } catch (e) {
                log.error('Failed to decrypt the passkey from backup hash, the backup hash may be incorrect', e);
                return null;
            }

            if (await validatePasskey(decryptedPasskey)) {
                return decryptedPasskey;
            }

            log.error('The get passkey from backup hash is invalid');
            return null;
        } catch (e) {
            log.error('Failed to derive key from backup hash', e);
            return null;
        }
    };

    const helpers: ProvidePasskeyHelpers = {
        validatePasskey,
        validateBackupHashFormat,
        backupHashToKey,
        userinfo: config.userinfo,
        salts: config.salts
    };

    while (true) {
        const passkey = await options.providePasskey(helpers);

        if (await validatePasskey(passkey)) {
            return passkey;
        } else {
            log.warning('The provided passkey is invalid, please try again');
        }
    }
}


/**
 * Validates if a string matches the backup key format (xxxx-xxxx-xxxx-xxxx)
 * @param content - String to validate
 * @returns Whether the format is valid
 */
function validateBackupHashFormat(content: string) {
    if (!content) {
        return false;
    }

    // Define a regular expression to match the format xxxx-xxxx-xxxx-xxxx
    const pattern = /^[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}$/;
    return pattern.test(content);
}

async function fetchBackupPasskey(
    transfer: TransferHandle
) {
    const res = await transfer.requestJson('/req/profile/requestPasskeyBackup');
    return res.passkeyBackup ? loadSymmetricCryptoValueFromJson(res.passkeyBackup) : null;
}

async function fetchPasskeyValidator(transfer: TransferHandle) {
    const res = await transfer.requestJson('keychainPasskeyValidator');
    return res.validator ? loadSymmetricCryptoValue(res.validator) : null;
}
