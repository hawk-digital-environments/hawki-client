import Dexie, {type DexieOptions} from 'dexie';
import type {TableSchema} from './ResourceDb.js';
import type {Logger} from '../../logger.js';

export class DexieAdapter extends Dexie {
    constructor(
        schemas: TableSchema[],
        log: Logger,
        options?: DexieOptions
    ) {
        log.info(`Opening main database with stores: ${schemas.map(s => s.name).join(', ')}`);
        super('hawki_db', options);

        const stores: { [tableName: string]: string } = {};
        for (const schema of schemas) {
            stores[schema.name] = schema.indexString;
        }

        // Currently I use the nuclear option to delete old versions of the database,
        // it could be more graceful in the future by adding migration paths
        // but for now this is simpler and more robust
        this.version(1).stores(stores);
    }
}
