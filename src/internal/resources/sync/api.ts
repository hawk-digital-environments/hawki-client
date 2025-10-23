import type {Connection} from '../../connection/connection.js';
import type {SyncLog} from './sync.js';

export async function fetchSyncLogChunked(
    connection: Connection,
    onChunkReceived: (log: SyncLog) => Promise<boolean>,
    lastSync: string | null = null,
    roomId: number | null = null,
    chunkSize: number = 1000
): Promise<void> {
    let offset = 0;
    while (true) {
        const chunk = await connection.transfer.requestJson<SyncLog>('syncLog', {
            queryParams: {
                offset,
                limit: chunkSize,
                'last-sync': lastSync,
                'room-id': roomId
            }
        });

        const entryCount = chunk.log.length;

        if (entryCount === 0) {
            break; // No more entries to fetch
        }

        const res = await onChunkReceived(chunk);
        if (!res) {
            break; // Stop fetching if the callback returns false -> error occurred
        }

        if (entryCount < chunkSize) {
            break; // Last chunk received
        }

        offset += chunkSize;
    }
}
