import type {PersistedResourceName} from '../../resources.js';
import type {Logger} from '../../../logger.js';
import type {WriterCommiter} from './writerComitter.js';

type BatchDispatchedHandler = (tables: PersistedResourceName[]) => Promise<void>;

export function createWriterBatcher(
    commiter: WriterCommiter,
    log: Logger,
    batchDelayMs?: number
) {
    batchDelayMs = batchDelayMs ?? 150;
    log = log.withPrefix('WriterBatcher');
    let isCollectingAsOneBatch = false;
    const batchTimeouts = new Map<PersistedResourceName, ReturnType<typeof setTimeout>>();
    const runningBatches = new Map<PersistedResourceName, Promise<void>>();
    const enqueuedInOneBatch = new Set<PersistedResourceName>();

    const doDispatch: BatchDispatchedHandler = async (tables) => {
        try {
            await commiter(tables);
        } catch (e) {
            log.error('Error in onDispatched handler:', e);
            throw e;
        }
    };

    const executeAsRunningBatch = async (tableName: PersistedResourceName, cb: () => Promise<void>) => {
        const batchDone = new Promise<void>(async resolve => {
            try {
                await cb();
            } finally {
                runningBatches.delete(tableName);
                resolve();
            }
        });

        runningBatches.set(tableName, batchDone);

        await batchDone;
    };

    const enqueueBatch = (tableName: PersistedResourceName) => {
        if (isCollectingAsOneBatch) {
            enqueuedInOneBatch.add(tableName);
            return;
        }

        const timeout = batchTimeouts.get(tableName);
        if (timeout) {
            clearTimeout(timeout);
        }

        const newTimeout = setTimeout(async () => {
                batchTimeouts.delete(tableName);
                const batchDone = runningBatches.get(tableName);
                if (batchDone) {
                    await batchDone;
                    // Re-enqueue if a batch is already running for this table or for all tables
                    enqueueBatch(tableName);
                    return;
                }
                await executeAsRunningBatch(tableName, () => doDispatch([tableName]));
            },
            batchDelayMs
        );

        batchTimeouts.set(tableName, newTimeout);
    };

    const dequeueBatch = async (tableName: PersistedResourceName) => {
        batchTimeouts.delete(tableName);
        const batchDone = runningBatches.get(tableName);
        if (batchDone) {
            await batchDone;
        }
    };

    const asOneBatch = async <T>(cb: () => Promise<T>): Promise<T> => {
        if (isCollectingAsOneBatch) {
            log.error(`You can not nest asOneBatch calls`);
            throw new Error('Already collecting as one batch');
        }
        isCollectingAsOneBatch = true;
        enqueuedInOneBatch.clear();

        // Wait until all running batches are done so we do not interfere with them
        const runningBatchPromises = Array.from(runningBatches.values());
        if (runningBatchPromises.length > 0) {
            await Promise.all(runningBatchPromises);
        }

        try {
            return await cb();
        } catch (e) {
            // If an error occurs, we also roll back all the collected tables
            enqueuedInOneBatch.clear();
            log.error('Error in asOneBatch callback:', e);
            throw e;
        } finally {
            isCollectingAsOneBatch = false;

            // Dispatch all collected tables
            const tablesToDispatch = Array.from(enqueuedInOneBatch);
            if (tablesToDispatch.length > 0) {
                await doDispatch(tablesToDispatch);
            }

            enqueuedInOneBatch.clear();
        }
    };

    return {
        enqueueBatch,
        dequeueBatch,
        asOneBatch
    };
}
