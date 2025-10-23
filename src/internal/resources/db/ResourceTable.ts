import type {PersistedResourceName, ResourceStoredType, ResourceType} from '../resources.js';
import type {Connection} from '../../connection/connection.js';
import Dexie, {type Table} from 'dexie';
import type {DebouncedWriter, DebouncedWriterIdProvider} from './DebouncedWriter.js';
import {createStoreFrontProvider} from '../stores/ReactiveStoreFront.js';
import {createLiveQueryStore} from '../stores/LiveQueryStore.js';
import {filterUndefinedAndNullAsync} from '../stores/utils.js';

export type ResourceTable<TResourceName extends PersistedResourceName> = ReturnType<typeof createResourceTable<TResourceName>>;

export function createResourceTable<TResourceName extends PersistedResourceName>
(
    connection: Omit<Connection, 'resourceDb'>,
    table: Dexie.Table<any, number, any>,
    debouncedWriter: DebouncedWriter<TResourceName>,
    resourceName: TResourceName
) {
    const {
        eventBus,
        log
    } = connection;

    const ifConnected = (cb: () => void): void => {
        if (!connection.connected.get()) {
            log.warning(`Not performing operation because connection is not active`);
            return;
        }
        cb();
    };

    const set = (
        resource: ResourceType<TResourceName>
    ): Promise<void> => {
        // noinspection SuspiciousTypeOfGuard
        if (!resource || typeof resource.id !== 'number') {
            log.error(`Resource does not have a numeric 'id' property`, resource);
            throw new Error(`Resource ${resourceName} must have a numeric 'id' property`);
        }

        return debouncedWriter.set(resource.id, resource);
    };

    table.hook('creating', (_, record) => {
        ifConnected(() => eventBus.dispatchStorageChange(resourceName, 'set', record));
    });
    table.hook('updating', (_, _1, record) => {
        ifConnected(() => eventBus.dispatchStorageChange(resourceName, 'set', record));
    });
    table.hook('deleting', (_, record) => {
        if (!record) {
            return;
        }
        ifConnected(() => eventBus.dispatchStorageChange(resourceName, 'remove', record));
    });
    eventBus.onSyncEvent(resourceName, 'set', (resource) => {
        ifConnected(() => set(resource));
    });
    eventBus.onSyncEvent(resourceName, 'remove', (recordId) => {
        ifConnected(() => debouncedWriter.remove(recordId));
    });
    eventBus.onClearSyncedData(async () => {
        log.info(`Clearing all records from storage`);
        await table.clear();
        await debouncedWriter.clear();
    });

    const remove = (
        filter: ResourceType<TResourceName> | DebouncedWriterIdProvider
    ): Promise<void> => {
        if (filter && typeof (filter as any).id === 'number') {
            filter = (filter as any).id;
        }
        return debouncedWriter.remove(filter as DebouncedWriterIdProvider);
    };

    const list = createStoreFrontProvider<
        ResourceStoredType<TResourceName>[],
        (db: Table<ResourceStoredType<TResourceName>, number>) => Promise<any[]>,
        undefined
    >(
        (filter) => createLiveQueryStore<ResourceStoredType<TResourceName>[]>(
            connection.log,
            async () => filterUndefinedAndNullAsync(filter ? filter(table) : table.toArray())
        )
    );

    const one = createStoreFrontProvider<
        ResourceStoredType<TResourceName> | undefined,
        number | ((db: Table<ResourceStoredType<TResourceName>, number>) => Promise<any>),
        undefined
    >(
        (filter) => createLiveQueryStore<ResourceStoredType<TResourceName> | undefined>(
            connection.log,
            async () => {
                if (typeof filter === 'number') {
                    return table.get(filter);
                } else if (filter) {
                    return filter(table);
                }
                return undefined;
            }
        )
    );

    const count = createStoreFrontProvider<number, (db: Table<ResourceStoredType<TResourceName>, number>) => Promise<number>>(
        (filter) => createLiveQueryStore<number>(
            connection.log,
            () => filter ? filter(table) : table.count()
        )
    );

    return {
        table: table,
        list,
        one,
        count,
        set,
        remove
    };
}
