import type {WriterQueueProvider} from './writerQueue.js';
import type {PersistedResourceName, ResourceStoredType} from '../../resources.js';
import Dexie from 'dexie';
import type {ToStoredResourceConverter} from '../toStoredResourceConverter.js';
import type {Logger} from '../../../logger.js';

export type WriterCommiter = ReturnType<typeof createWriterCommiter>;

export function createWriterCommiter(
    db: Dexie,
    queueProvider: WriterQueueProvider,
    log: Logger
) {
    log = log.withPrefix('WriterCommiter');
    const toStoredResourceConverters = new Map<PersistedResourceName, ToStoredResourceConverter<any>>();

    const addToStoredResourceConverter = <TTableName extends PersistedResourceName>(tableName: TTableName, converter: ToStoredResourceConverter<TTableName>) => {
        if (toStoredResourceConverters.has(tableName)) {
            log.warning(`Overriding existing toStoredResourceConverter for table ${tableName}`);
        }
        toStoredResourceConverters.set(tableName, converter);
    };

    const commiter = async (tables: PersistedResourceName[]) => {
        const transactionSteps = new Map<PersistedResourceName, {
            set: ResourceStoredType<any>[],
            remove: number[],
            table: Dexie.Table<ResourceStoredType<any>, number>,
            resolve: () => void,
            reject: (error: any) => void
        }>();

        const tablesToLock: Dexie.Table[] = [];
        for (const tableName of tables) {
            const _log = log.withPrefix(`Table:${tableName}`);

            const queueData = await queueProvider.get(tableName).getClean();
            if (!queueData) {
                _log.debug('No pending actions after all, skipping');
                continue;
            }

            const table = db.table<ResourceStoredType<any>, number>(tableName);
            if (!table) {
                _log.error(`Table ${tableName} does not exist in the database, skipping`);
                queueData.reject(new Error(`Table ${tableName} does not exist in the database`));
                continue;
            }

            const recordsToSet: ResourceStoredType<any>[] = [];
            if (queueData.recordsToSet.length > 0) {
                const converter = toStoredResourceConverters.get(tableName);
                if (converter) {
                    recordsToSet.push(
                        ...(await converter(
                            queueData.recordsToSet,
                            queueData.idsToSet
                        ))
                    );
                }

                // If we now no longer have records to set, and there is nothing to remove, we can just resolve and continue
                if (recordsToSet.length === 0 && queueData.idsToRemove.length === 0) {
                    _log.debug('No records to set or remove after conversion, resolving and skipping');
                    queueData.resolve();
                    continue;
                }
            }

            _log.debug(`Committing ${recordsToSet.length} sets and ${queueData.idsToRemove.length} removes`);

            tablesToLock.push(table);

            transactionSteps.set(tableName, {
                set: recordsToSet,
                remove: queueData.idsToRemove,
                table,
                resolve: queueData.resolve,
                reject: queueData.reject
            });
        }

        if (transactionSteps.size === 0) {
            log.debug('No transaction steps to process, returning');
            return;
        }

        await db.transaction('rw', tablesToLock, async () => {
            log.debug(`Starting transaction for ${transactionSteps.size} tables`);
            for (const [tableName, actions] of transactionSteps) {
                const _log = log.withPrefix(`Table:${tableName}`);
                const table = actions.table;
                try {
                    if (actions.set.length > 0) {
                        _log.debug(`Setting ${actions.set.length} records`, actions.set);
                        await table.bulkPut(actions.set);
                    }
                    if (actions.remove.length > 0) {
                        _log.debug(`Removing ${actions.remove.length} records`, actions.remove);
                        await table.bulkDelete(actions.remove);
                    }
                    actions.resolve();
                } catch (e) {
                    _log.error('Error during commit:', e);
                    actions.reject(e);
                }
            }
        });
    };

    commiter.addToStoredRecordConverter = addToStoredResourceConverter;

    return commiter;
}
