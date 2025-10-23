import type {PersistedResourceName, ResourceDefinition, ResourceName} from '../resources.js';
import type {Connection} from '../../connection/connection.js';
import {createResourceTable, type ResourceTable} from './ResourceTable.js';
import Dexie, {type DexieOptions} from 'dexie';
import {createDebouncedWriterProvider, type DebouncedWriterProvider} from './DebouncedWriter.js';
import {createToStoredResourceConverter} from './toStoredResourceConverter.js';
import {resources} from '../../../HawkiClient.js';
import type {Logger} from '@lib/internal/logger.js';

export type ResourceDb = ReturnType<typeof createResourceDb>;

const metaTableName = '_hawki_meta';
const userHashMetaKey = 'userHash';
const hawkiVersionMetaKey = 'hawkiVersion';
const clientVersionMetaKey = 'clientVersion';

// Omit the resourceDb property to avoid circular references
export function createResourceDb(_connection: Omit<Connection, 'resourceDb'>) {
    const log = _connection.log.withPrefix('ResourceDb');
    const connection = {..._connection, log} as Connection;
    log.info('Connecting to local resource database');

    const schemas = createTableSchemas(resources);
    schemas.push(createSchemaForMetaTable());

    const db = createDb(schemas, log);

    const meta = createMetaHandle(db);

    connection.eventBus.onInit(async () => {
        const {
            userinfo: {hash: userHash},
            config: {version: {hawki: hawkiVersion, client: clientVersion}}
        } = connection;

        const storedUserHash = await meta.get(userHashMetaKey);
        const storedHawkiVersion = await meta.get(hawkiVersionMetaKey);
        const storedClientVersion = await meta.get(clientVersionMetaKey);

        let resetNeeded = false;

        if (storedUserHash && storedUserHash !== userHash) {
            log.info('User hash has changed, clearing database');
            resetNeeded = true;
        } else if (storedHawkiVersion && storedHawkiVersion !== hawkiVersion) {
            log.info('Hawki version has changed, clearing database');
            resetNeeded = true;
        } else if (storedClientVersion && storedClientVersion !== clientVersion) {
            log.info('Client version has changed, clearing database');
            resetNeeded = true;
        }

        if (resetNeeded) {
            log.info(`Resetting storage database ${db.name}`);

            await db.delete();
            await db.open();
        }

        if (!storedUserHash || resetNeeded) {
            await meta.set(userHashMetaKey, userHash);
        }
        if (!storedHawkiVersion || resetNeeded) {
            await meta.set(hawkiVersionMetaKey, hawkiVersion);
        }
        if (!storedClientVersion || resetNeeded) {
            await meta.set(clientVersionMetaKey, clientVersion);
        }
    });

    connection.eventBus.onDisconnect(async ({clear}) => {
        if (db.hasBeenClosed()) {
            return;
        }

        if (clear) {
            log.info(`Deleting storage database ${db.name}`);
            await db.delete();
        }

        log.info('Closing storage database connection');
        db.close();
    }, connection.eventBus.LOWEST_PRIORITY);

    const debouncedWriterProvider = createDebouncedWriterProvider(db, log);
    const tables = createTables(connection, db, debouncedWriterProvider);

    /**
     * Returns a ResourceTable instance for the given resource name.
     * The table allows a variety of operations on the resource, including
     * querying, adding, updating, and deleting records.
     *
     * @param resourceName The name of the resource to get the table for
     * @throws Error if the resource is not persisted in the indexedDB
     */
    const getTable = <TResourceName extends PersistedResourceName>(resourceName: TResourceName): ResourceTable<TResourceName> => {
        if (tables.has(resourceName)) {
            return tables.get(resourceName) as ResourceTable<TResourceName>;
        }

        throw new Error(`Resource "${resourceName}" is not persisted in the indexedDB`);
    };

    /**
     * Commits all operations performed within the callback as a single batch.
     * This ensures that all operations are done in the same database transaction,
     * which helps to avoid intermediate states that could lead to inconsistent data and unexpected re-renders
     * of the reactive stores.
     */
    const commitAsSingleBatch = async <T>(callback: () => Promise<T>): Promise<T> =>
        debouncedWriterProvider.writeAsOneBatch(callback);

    return {
        /**
         * The Dexie database instance
         * WARING: Direct usage of this property is discouraged, use getTable() instead
         * to get a ResourceTable instance for a specific resource.
         */
        db,

        /**
         * Handle to get/set meta information in the database.
         * This is a simple key-value store within the database.
         */
        meta,

        getTable,
        commitAsSingleBatch
    };
}

export interface TableSchema {
    name: string;
    indexString: string;
}

/**
 * Uses the object variants of defining the resources to create the table schemas for Dexie.
 * @param resources
 */
function createTableSchemas(
    resources: Record<ResourceName, ResourceDefinition<any>>
): TableSchema[] {
    const schemas: TableSchema[] = [];

    for (const [resourceName, definition] of Object.entries(resources)) {
        // If the resource is not persisted, skip it
        if (definition.transient) {
            continue;
        }

        const indexedKeys: string[] = [];
        if (Array.isArray(definition.indexedKeys)) {
            definition.indexedKeys.forEach(key => {
                if (typeof key === 'string') {
                    indexedKeys.push(key);
                }
            });
        }
        if (!indexedKeys.includes('id')) {
            indexedKeys.unshift('id');
        }

        if (Array.isArray(definition.compoundIndexes)) {
            for (const compoundIndex of definition.compoundIndexes) {
                if (!Array.isArray(compoundIndex) || compoundIndex.length < 2) {
                    throw new Error('Compound indexes must be arrays of at least two indexed keys');
                }
                const index = `[${compoundIndex.join('+')}]`;
                if (!indexedKeys.includes(index)) {
                    indexedKeys.push(index);
                }
            }
        }

        schemas.push({
            name: resourceName,
            indexString: indexedKeys.join(', ')
        });
    }

    return schemas;
}

/**
 * Creates the Dexie database instance with the given schemas.
 */
function createDb(
    schemas: TableSchema[],
    log: Logger,
    options?: DexieOptions
): Dexie {
    log.info(`Opening main database with stores: ${schemas.map(s => s.name).join(', ')}`);

    const db = new Dexie('hawki_db', options);

    const stores: { [tableName: string]: string } = {};
    for (const schema of schemas) {
        stores[schema.name] = schema.indexString;
    }

    // Currently I use the nuclear option to delete old versions of the database,
    // it could be more graceful in the future by adding migration paths
    // but for now this is simpler and more robust
    db.version(1).stores(stores);

    return db;
}

function createTables(
    connection: Connection,
    db: Dexie,
    debouncedWriterProvider: DebouncedWriterProvider
) {
    const tables = new Map<ResourceName, ResourceTable<PersistedResourceName>>();
    for (const [resourceName, definition] of Object.entries(resources)) {
        if (definition.transient) {
            continue;
        }

        const _log = connection.log.withPrefix(`Table(${resourceName})`);
        _log.debug(`Setting up resource table`);

        const dexieTable = db.table(resourceName) as Dexie.Table<any, number, any>;

        const resourceTable = createResourceTable<PersistedResourceName>(
            {...connection, log: _log},
            dexieTable,
            debouncedWriterProvider.createWriter(
                resourceName as PersistedResourceName,
                createToStoredResourceConverter(
                    connection,
                    dexieTable,
                    definition as ResourceDefinition<any>
                )
            ),
            resourceName as PersistedResourceName
        );

        tables.set(resourceName as PersistedResourceName, resourceTable);
    }

    return tables;
}

function createSchemaForMetaTable(): TableSchema {
    return {
        name: metaTableName,
        indexString: 'key'
    };
}

function createMetaHandle(db: Dexie) {
    /**
     * Gets a meta value by its key. If the key does not exist, returns the provided default value.
     */
    const get = async (key: string, defaultValue?: any): Promise<any> => {
        const entry = await db.table(metaTableName).get(key);
        if (entry) {
            return entry.value;
        }
        return defaultValue;
    };

    /**
     * Sets a meta value by its key.
     */
    const set = async (key: string, value: any): Promise<void> => {
        await db.table(metaTableName).put({key, value});
    };

    /**
     * Clears a meta value by its key.
     */
    const clear = async (key: string): Promise<void> => {
        await db.table(metaTableName).delete(key);
    };

    return {
        get,
        set,
        clear
    };
}
