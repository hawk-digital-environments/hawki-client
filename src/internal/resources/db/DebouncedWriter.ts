import type {PersistedResourceName, ResourceName, ResourceStoredType, ResourceType} from '../resources.js';
import Dexie, {type Collection} from 'dexie';
import {createWriterQueueProvider, type WriterQueueIdProvider} from './debouncedWriter/writerQueue.js';
import type {ToStoredResourceConverter} from './toStoredResourceConverter.js';
import type {Logger} from '../../logger.js';
import {createWriterCommiter} from './debouncedWriter/writerComitter.js';
import {createWriterBatcher} from './debouncedWriter/writerBatcher.js';

export type DebouncedWriterProvider = ReturnType<typeof createDebouncedWriterProvider>;

export type DebouncedWriterIdProvider =
    number
    | number[]
    | ((table: Dexie.Table) => number | Promise<number> | number[] | Promise<number[]> | Collection<{
    id: number
}> | Promise<Collection<{ id: number }>>);

export interface DebouncedWriter<TResourceName extends ResourceName> {
    set: (id: number, record: ResourceType<TResourceName>) => Promise<void>;
    remove: (ids: DebouncedWriterIdProvider) => Promise<void>;
    clear: () => Promise<void>;
}

export function createDebouncedWriterProvider(db: Dexie, log: Logger) {
    log = log.withPrefix('DebouncedWriter');

    const queueProvider = createWriterQueueProvider();

    const commiter = createWriterCommiter(db, queueProvider, log);

    const batcher = createWriterBatcher(commiter, log);

    const createWriter = <TResourceName extends PersistedResourceName>(
        tableName: TResourceName,
        toStoredResourceConverter: ToStoredResourceConverter<TResourceName>
    ): DebouncedWriter<TResourceName> => {
        commiter.addToStoredRecordConverter(tableName, toStoredResourceConverter);

        const queue = queueProvider.get<TResourceName>(tableName);

        const set = (id: number, record: ResourceType<TResourceName>) => {
            batcher.enqueueBatch(tableName);
            return queue.collectSet(id, record as any);
        };

        const remove = (ids: DebouncedWriterIdProvider) => {
            batcher.enqueueBatch(tableName);

            // If ids is a function, we need to wrap it to provide the table instance
            if (typeof ids === 'function') {
                const _givenIds = ids;
                ids = () => _givenIds(db.table(tableName) as Dexie.Table<ResourceStoredType<TResourceName>>);
            }

            return queue.collectRemove(ids as WriterQueueIdProvider);
        };

        const clear = async () => {
            await batcher.dequeueBatch(tableName);
            queue.clear();
        };

        return {
            set,
            remove,
            clear
        };
    };

    const writeAsOneBatch = async <T>(callback: () => Promise<T>): Promise<T> => {
        return batcher.asOneBatch(callback);
    };

    return {
        createWriter,
        writeAsOneBatch
    };
}
