import type {Connection} from '../../connection/connection.js';
import type {
    KeychainValueToRemove,
    KeychainValueToSet
} from './KeychainValueTransfer.js';

export async function sendKeychainUpdate(
    connection: Connection,
    set: KeychainValueToSet[],
    remove: KeychainValueToRemove[]
) {
    let hasPayload = false;
    const payload: { set?: KeychainValueToSet[], remove?: KeychainValueToRemove[] } = {};
    if (set.length > 0) {
        payload.set = set;
        hasPayload = true;
    }
    if (remove.length > 0) {
        payload.remove = remove;
        hasPayload = true;
    }

    if (!hasPayload) {
        return;
    }

    await connection.transfer.requestJsonWith('keychainUpdate', payload);
}
