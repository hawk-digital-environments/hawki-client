import type {Room} from '../../rooms/rooms.js';
import type {SyncLogEntry} from './sync.js';
import {createSyncHandler} from './syncHandler.js';
import {defineFeature} from '../../features/features.js';
import type {ResourceDb} from '../db/ResourceDb.js';

export const SyncFeature = defineFeature(
    (connection, {autoSync}) => {
        const {eventBus, resourceDb} = connection;
        const log = connection.log.withPrefix('Sync');
        const lastSync = createLastSyncHandle(resourceDb);

        const resetStoreDueToError = async (error: unknown, entry: SyncLogEntry) => {
            log.error('Error during sync, clearing local store to recover', error);
            log.error('Tried to process entry:', entry);
            await eventBus.dispatchClearSyncedData();
        };

        const dispatchSyncEvent = async (entry: SyncLogEntry) => {
            if (entry.action === 'set') {
                // Ensure the resource ALWAYS contains a numeric id
                // noinspection SuspiciousTypeOfGuard
                if (!entry.resource || typeof entry.resource.id !== 'number') {
                    entry.resource.id = entry.resource_id;
                }

                await eventBus.dispatchSyncEvent(entry.type, 'set', entry.resource);
            } else {
                await eventBus.dispatchSyncEvent(entry.type, 'remove', entry.resource_id);
                if (entry.resource) {
                    await eventBus.dispatchSyncEvent(entry.type, 'remove:resource', entry.resource);
                }
            }

            await lastSync.set(entry.timestamp);
        };

        const sync = createSyncHandler(
            connection,
            resetStoreDueToError,
            dispatchSyncEvent
        );

        const startSync = async (roomId?: number): Promise<void> => {
            return sync.run(roomId, await lastSync.get());
        };

        if (autoSync !== false) {
            eventBus.onInit(() => startSync(), eventBus.LOWEST_PRIORITY);
        }

        const handleIncomingSyncLogEntry = async (message: SyncLogEntry) => {
            // If we are no longer connected, ignore any incoming messages
            if (!connection.connected.get()) {
                return;
            }

            if (sync.isGlobalSyncRunning()) {
                log.info('Global Sync in progress, ignoring SyncLogEvent');
                return;
            }

            try {
                return dispatchSyncEvent(message);
            } catch (e) {
                return resetStoreDueToError(e, message);
            }
        };

        eventBus.onUserWebsocketMessage('SyncLogEvent', handleIncomingSyncLogEntry);
        eventBus.onAllUsersWebsocketMessage('SyncLogEvent', handleIncomingSyncLogEntry);
        eventBus.onSyncLogInResponseEvent(
            async (syncLog) => {
                log.info('A fetch response contained a sync log, processing it now...');
                await sync.apply(syncLog);
            }
        );

        eventBus.onDisconnect(async ({clear}) => {
            sync.stopAllSyncs();
            if (clear) {
                log.info('Clear of all data requested, clearing local store');
                await eventBus.dispatchClearSyncedData();
                await lastSync.clear();
                sync.stopAllSyncs();
            }
        });

        /**
         * Start a sync of all resources. If `force` is true, the last sync timestamp will be cleared first, causing a full re-sync.
         * This is a fairly expensive operation and should be considered carefully.
         * You only need to sync the data once, after that the client will keep itself up to date automatically using websockets.
         *
         * IMPORTANT: You only NEED to do this if a.) you disabled `autoSync` in the client options or b.)
         * your client was offline for a long time, and you want to ensure you have all data locally.
         *
         * SUPER IMPORTANT: You should normally not have to "force" a full resync, as the client will automatically keep track of the last sync timestamp
         * and only fetch the missing data. Forcing a full resync will cause a lot of unnecessary load on the server and should only be used
         * in very specific situations, e.g. if you suspect the local data is corrupted or inconsistent.
         *
         * @param force
         */
        const doAll = async (force?: boolean) => {
            if (force === true) {
                await lastSync.clear();
            }
            return startSync();
        };

        /**
         * Start a sync of all resources in a specific room. You do not need to call this method if you
         * already called `syncAll` before, as the room data will be synced automatically.
         *
         * IMPORTANT: Theoretically you should never have to call this method, as the client will automatically keep track of the last sync timestamp
         * and only fetch the missing data. It should always be sufficient to call `syncAll` once.
         * This method is only provided for completeness and for very specific use cases.
         * @param room
         */
        const doRoom = async (room: Room | number) =>
            startSync(
                typeof room === 'number' ? room : room.id
            );

        return {
            all: doAll,
            room: doRoom
        };
    }
);

function createLastSyncHandle(resourceDb: ResourceDb) {
    const lastSyncKey = 'lastSync';
    const clear = () => resourceDb.meta.clear(lastSyncKey);
    const get = () => resourceDb.meta.get(lastSyncKey, null);
    const set = async (date: string) => {
        // date and knownLastSync have the format: 2025-09-09T18:13:11.000000Z
        // we need to compare the six digit microsecond precision, which is not supported by Date
        // So we first check the dates with each other and then extract the microsecond part of both to compare them as numbers
        const knownLastSync = await get();
        if (knownLastSync) {
            if (new Date(knownLastSync) > new Date(date)) {
                return;
            }
            const knownMicroPart = parseInt(knownLastSync.substring(-7, -1));
            const microPart = parseInt(date.substring(-7, -1));
            if (knownMicroPart > microPart) {
                return;
            }
        }
        await resourceDb.meta.set(lastSyncKey, date);
    };

    return {clear, get, set};
}
