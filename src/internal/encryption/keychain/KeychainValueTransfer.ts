import type {UserKeychainValueType} from './keychain.js';
import {sendKeychainUpdate} from './api.js';
import type {Connection} from '../../connection/connection.js';

export interface KeychainValueToSet {
    key: string;
    value: string;
    type: UserKeychainValueType;
}

export interface KeychainValueToRemove {
    key: string;
    type: UserKeychainValueType;
}

export function createKeychainValueTransfer(
    connection: Connection
) {
    const queuedSets = new Map<string, KeychainValueToSet>();
    const queuedRemovals = new Map<string, KeychainValueToRemove>();
    let timeout: ReturnType<typeof setTimeout> | 0 = 0;
    let isTransferring = false;

    const startTransfer = async () => {
        isTransferring = true;
        try {
            const sets = Array.from(queuedSets.values());
            const removals = Array.from(queuedRemovals.values());
            queuedSets.clear();
            queuedRemovals.clear();
            await sendKeychainUpdate(connection, sets, removals);
        } catch (error) {
            connection.log.error('Failed to transfer keychain values:', error);
        } finally {
            isTransferring = false;
            if (queuedSets.size > 0 || queuedRemovals.size > 0) {
                scheduleTransfer();
            }
        }
    };

    const scheduleTransfer = () => {
        if (isTransferring) {
            return;
        }
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
            timeout = 0;
            startTransfer();
        }, 200);
    };

    const makeCombinedKey = (key: string, type: UserKeychainValueType) => `${type}:${key}`;

    /**
     * Enqueue a keychain value to be set on the server.
     * Multiple calls to set the same key will result in only the last value being sent.
     * If a key is enqueued for removal, it will be removed from the removal queue.
     * The actual transfer to the server is debounced to occur after 200ms of inactivity.
     * @param key
     * @param value
     * @param type
     */
    const set = (key: string, value: string, type: UserKeychainValueType) => {
        const storageKey = makeCombinedKey(key, type);
        queuedSets.set(storageKey, {key, value, type});
        queuedRemovals.delete(storageKey);
        scheduleTransfer();
    };

    /**
     * Enqueue a keychain value to be removed from the server.
     * Multiple calls to remove the same key will result in only one removal being sent.
     * If a key is enqueued for setting, it will be removed from the set queue.
     * The actual transfer to the server is debounced to occur after 200ms of inactivity.
     * @param key
     * @param type
     */
    const remove = (key: string, type: UserKeychainValueType) => {
        const storageKey = makeCombinedKey(key, type);
        queuedRemovals.set(storageKey, {key, type});
        queuedSets.delete(storageKey);
        scheduleTransfer();
    };

    return {
        set,
        remove
    } as const;

}
