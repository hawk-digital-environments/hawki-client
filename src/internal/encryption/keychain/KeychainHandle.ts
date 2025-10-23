import {deriveKey, exportCryptoKeyToString, loadCryptoKey} from '../utils.js';
import {
    decryptSymmetric,
    encryptSymmetric,
    generateSymmetricKey,
    loadSymmetricCryptoValue
} from '../symmetric.js';
import type {CommonConnectionConfig, Connection} from '../../connection/connection.js';
import {
    exportPrivateKeyToString,
    exportPublicKeyToString,
    loadPrivateKey,
    loadPublicKey
} from '../asymmetric.js';
import {type ResourceStoredType} from '../../resources/resources.js';
import type {Room} from '../../rooms/rooms.js';
import type {UserKeychainValueType} from './keychain.js';
import {createKeychainValueTransfer} from './KeychainValueTransfer.js';
import {deriveMap} from '../../resources/stores/utils.js';

export type KeychainHandle = Awaited<ReturnType<typeof createKeychainHandle>>;

export interface RoomKeys {
    /**
     * The crypto key used to encrypt/decrypt user messages in the room.
     */
    roomKey: CryptoKey;
    /**
     * The AI key derived from the room key, used for AI-related operations.
     * This key is derived using the room slug and the AI salt.
     */
    aiKey: CryptoKey;
    /**
     * The AI key derived from the room key, used for AI-related operations.
     * This key is derived using the room slug and the AI salt.
     * This is a legacy key, used for compatibility with older versions of Hawki.
     * @deprecated In newer code, use `aiKey` instead.
     */
    aiLegacyKey: CryptoKey;
}

export function createKeychainHandle(connection: Connection, passkey: string) {
    const log = connection.log.withPrefix('Keychain');
    const {
        config,
        resourceDb,
        eventBus
    } = connection;
    const {salts: {ai: aiSalt}} = config;

    const records = resourceDb.getTable('user_keychain_value');
    const keychainPassword = deriveKeychainPassword(config, passkey);
    const keychainTransfer = createKeychainValueTransfer(connection);

    const mappedStore = (type: UserKeychainValueType) =>
        records.list.get(
            type,
            table => table.where({type}).toArray()
        )
            .derive('mapped', list => deriveMap(list, val => val.key));

    const convertValue = async ({value, type}: ResourceStoredType<'user_keychain_value'>) => {
        const decrypted = await decryptSymmetric(
            loadSymmetricCryptoValue(value),
            await keychainPassword
        );

        if (type === 'public_key') {
            return await loadPublicKey(decrypted);
        }

        if (type === 'private_key') {
            return await loadPrivateKey(decrypted);
        }

        return await loadCryptoKey(decrypted);
    };

    const setKeychainValue = async (key: string, value: CryptoKey, type: UserKeychainValueType) => {
        let valueString: string;

        if (type === 'private_key') {
            valueString = await exportPrivateKeyToString(value);
        } else if (type === 'public_key') {
            valueString = await exportPublicKeyToString(value);
        } else {
            valueString = await exportCryptoKeyToString(value);
        }

        const encrypted = await encryptSymmetric(
            valueString,
            await keychainPassword
        );

        keychainTransfer.set(key, encrypted.toString(), type);
    };

    const removeKeychainValue = async (key: string, type: UserKeychainValueType) => {
        keychainTransfer.remove(key, type);
    };

    /**
     * Returns an array containing all key-names in the keychain
     */
    const listKeys = (type: UserKeychainValueType) => mappedStore(type)
        .derive('keys', map => Array.from(map.keys()));

    /**
     * Returns the users private key, to decrypt data sent to them
     */
    const privateKey = () =>
        mappedStore('private_key')
            .derive('loaded', async (map) => {
                if (!map.has('privateKey')) {
                    throw new Error('Private key is not stored in the keychain!');
                }
                return convertValue(map.get('privateKey')!);
            });

    /**
     * Returns the users public key, to encrypt data sent to them
     */
    const publicKey = () =>
        mappedStore('public_key')
            .derive('loaded', async (map) => {
                if (!map.has('publicKey')) {
                    throw new Error('Public key is not stored in the keychain!');
                }
                return convertValue(map.get('publicKey')!);
            });

    /**
     * Returns a map of all room keys in the keychain, mapped by room slug.
     * If the AI key or legacy AI key for a room is missing, new keys will be derived and stored.
     * This ensures that all rooms have the necessary keys for encryption and AI operations.
     */
    const roomKeys = () =>
        records.list.get(
            'roomKeys',
            table => table.where('type').anyOf(['room_key', 'room_ai', 'room_ai_legacy']).toArray()
        ).derive(
            'mapped',
            async (list) => {
                const roomKeys: Array<ResourceStoredType<'user_keychain_value'>> = [];
                const aiKeys = new Map<string, ResourceStoredType<'user_keychain_value'>>();
                const aiLegacyKeys = new Map<string, ResourceStoredType<'user_keychain_value'>>();
                list.forEach(item => {
                    if (item.type === 'room_ai') {
                        aiKeys.set(item.key, item);
                    } else if (item.type === 'room_ai_legacy') {
                        aiLegacyKeys.set(item.key, item);
                    } else {
                        roomKeys.push(item);
                    }
                });

                const mapped = new Map<string, RoomKeys>();
                const writers: (() => Promise<void>)[] = [];
                const promises: Promise<void>[] = [];
                for (const value of roomKeys) {
                    const key = value.key;
                    log.debug(`Mapping room key for room: "${key}"`);
                    promises.push((async () => {
                        const roomKey = await convertValue(value);
                        if (!(roomKey instanceof CryptoKey)) {
                            return;
                        }

                        let aiKey: CryptoKey;
                        let aiLegacyKey: CryptoKey;
                        if (!aiKeys.has(key) || !aiLegacyKeys.has(key)) {
                            console.log(aiKeys, aiLegacyKeys);
                            log.info(`AI key or legacy AI key for room "${key}" is missing, scheduling generation of new keys...`);
                            aiKey = await deriveKey(roomKey, key, aiSalt);
                            // No need to wait, fire and forget
                            // Due to a bug in the initial deriveKey implementation,
                            // the room key was not used to derive the AI key, instead the CryptoKey was used as string,
                            // meaning it was cast into a string representation of the CryptoKey object.
                            // This is a workaround to support legacy keys.
                            aiLegacyKey = await deriveKey('[object CryptoKey]', key, aiSalt);
                            writers.push(async () => setKeychainValue(key, aiKey, 'room_ai'));
                            writers.push(async () => setKeychainValue(key, aiLegacyKey, 'room_ai_legacy'));
                        } else {
                            aiKey = await convertValue(aiKeys.get(key)!);
                            aiLegacyKey = await convertValue(aiLegacyKeys.get(key)!);
                        }

                        mapped.set(key, {
                            roomKey,
                            aiKey,
                            aiLegacyKey
                        });
                    })());
                }
                await Promise.all(promises);
                await Promise.all(writers.map(fn => fn()));

                return mapped;
            }
        );

    /**
     * The same as "roomKeys", but for a specific room.
     * If the room does not have keys, null is returned.
     * @param room
     */
    const roomKeysOf = (room: Room | string) => {
        const roomSlug = typeof room === 'string' ? room : room.slug;
        return roomKeys().derive(
            roomSlug,
            (m) => m?.get(roomSlug) || null
        );
    };

    /**
     * Imports a room key (from an invitation) into the keychain.
     * If the room key already exists, it will be overwritten.
     * @param roomSlug
     * @param roomKey
     */
    const importRoomKey = async (roomSlug: string, roomKey: CryptoKey) => {
        log.debug('Importing room key for room:', roomSlug);
        await setKeychainValue(roomSlug, roomKey, 'room_key');
    };

    const createRoomKey = async (roomSlug: string): Promise<RoomKeys | null> => {
        log.debug('Creating new room keys for room:', roomSlug);

        if (roomKeys().get()?.has(roomSlug)) {
            log.warning('Room keys for room already exist, not creating new ones:', roomSlug);
            return null;
        }

        await removeKeychainValue(roomSlug, 'room_ai');
        await removeKeychainValue(roomSlug, 'room_ai_legacy');
        await setKeychainValue(roomSlug, await generateSymmetricKey(), 'room_key');

        return roomKeysOf(roomSlug).getAsyncAsserted(2000);
    };

    const removeRoomKeys = async (roomSlug: string) => {
        log.debug('Removing room keys for room:', roomSlug);
        await Promise.all([
            removeKeychainValue(roomSlug, 'room_key'),
            removeKeychainValue(roomSlug, 'room_ai'),
            removeKeychainValue(roomSlug, 'room_ai_legacy')
        ]);
    };

    eventBus.onDisconnect(() => {
        records.list.clear();
    });

    return {
        publicKey,
        privateKey,
        listKeys,
        importRoomKey,
        roomKeys,
        roomKeysOf,
        createRoomKeys: createRoomKey,
        removeRoomKeys
    };
}

export function deriveKeychainPassword(
    config: CommonConnectionConfig,
    passkey: string
): Promise<CryptoKey> {
    return deriveKey(passkey, 'keychain_encryptor', config.salts.userdata);
}
