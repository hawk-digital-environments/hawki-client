import type {Connection} from '../connection/connection.js';

/**
 * When the current user is removed or reset, all synced data should be dropped.
 */
export function currentUserRemovalHandling(connection: Connection) {
    const {eventBus, log} = connection;
    eventBus.onSyncEvent('user_removal', 'remove', async () => {
        log.info('Current user was removed or reset, dropping all synced data and disconnecting');
        await connection.client.disconnect(true);
    });
}
