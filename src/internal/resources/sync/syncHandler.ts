import type {Connection} from '../../connection/connection.js';
import type {SyncLog, SyncLogEntry} from './sync.js';
import {fetchSyncLogChunked} from './api.js';

export function createSyncHandler(
    connection: Connection,
    resetStoreDueToError: (error: unknown, entry: SyncLogEntry) => Promise<void>,
    dispatchSyncEvent: (entry: SyncLogEntry) => Promise<void>
) {
    const {log, eventBus} = connection;

    let syncCounter = 0;
    const syncIds = new Map<number, number>();

    const ensureSyncId = (roomId?: number) => roomId || -1;
    const isGlobalSyncRunning = () => syncIds.has(-1);

    const stopAllSyncs = () => syncIds.clear();

    const apply = (syncLog: SyncLog, isStopped?: () => boolean) => {
        isStopped = isStopped || (() => false);
        return connection.resourceDb.commitAsSingleBatch(async () => {
            for (const entry of syncLog.log) {
                if (isStopped()) {
                    return false;
                }

                try {
                    await dispatchSyncEvent(entry);
                } catch (e) {
                    await resetStoreDueToError(e, entry);
                    return false;
                }
            }

            return true;
        });
    };

    const run = async (roomId?: number, lastSyncTs?: string | null): Promise<void> => {
        const syncId = ++syncCounter;
        const _log = log.withPrefix(`Sync ${syncId} - ${!roomId ? 'all entries' : `room ${roomId}`}`);
        _log.info(`Preparing to start tracked sync`);

        const isStopped = () => syncIds.get(ensureSyncId(roomId)) !== syncId;

        if (!roomId) {
            syncIds.clear();
        }

        syncIds.set(ensureSyncId(roomId), syncId);

        try {
            if (roomId) {
                lastSyncTs = null; // Always do full sync for room-specific syncs
            }

            if (isStopped()) {
                _log.info('Sync was stopped before it could start, aborting!');
                return;
            }

            let isFirstChunk = true;
            _log.info('Starting sync with server using and active api request...');
            await fetchSyncLogChunked(
                connection,
                async (syncLog) => {
                    if (isStopped()) {
                        return false;
                    }

                    if (isFirstChunk) {
                        isFirstChunk = false;
                        if (syncLog.type === 'full') {
                            if (roomId) {
                                await eventBus.dispatchClearSyncedDataForRoom(roomId);
                            } else {
                                await eventBus.dispatchClearSyncedData();
                            }
                        }
                    }

                    return await apply(syncLog, isStopped);
                },
                !roomId ? lastSyncTs : null,
                roomId
            );
        } catch (e) {
            _log.error(`Error during sync:`, e);
        } finally {
            if (syncIds.get(ensureSyncId(roomId)) === syncId) {
                syncIds.delete(ensureSyncId(roomId));
            }
            _log.info(`Completed tracked sync`);
        }
    };

    return {
        run,
        isGlobalSyncRunning,
        stopAllSyncs,
        apply
    };
}
