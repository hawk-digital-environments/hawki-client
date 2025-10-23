import type {
    PersistedResourceName,
    ResourceDefinition,
    ResourceStoredType,
    ResourceType
} from '../resources.js';
import Dexie from 'dexie';
import type {Connection} from '../../connection/connection.js';

export type ToStoredResourceConverter<TResourceName extends PersistedResourceName> = ReturnType<typeof createToStoredResourceConverter<TResourceName>>;

export function createToStoredResourceConverter<TResourceName extends PersistedResourceName>(
    connection: Connection,
    table: Dexie.Table<any, number>,
    definition: ResourceDefinition<any>
) {
    return async (
        records: ResourceType<TResourceName>[],
        ids: number[]
    ) => {
        const existingRecords = await table.bulkGet(ids);
        const existingRecordsById = new Map(
            existingRecords
                .filter(r => r)
                .map(r => [r!.id, r])
        );

        const recordConverter = (typeof definition?.toStoredResource === 'function')
            ? definition.toStoredResource
            : (resource: ResourceType<TResourceName>) => Promise.resolve(resource as any);

        const chunkSize = 5;
        const chunksToConvert: ResourceType<TResourceName>[][] = [];
        for (let i = 0; i < records.length; i += chunkSize) {
            chunksToConvert.push(records.slice(i, i + chunkSize));
        }

        const recordsToWrite: ResourceStoredType<TResourceName>[] = [];
        for (const chunk of chunksToConvert) {
            // Convert the current chunk
            // We do this in smaller chunks to avoid blocking the event loop for too long
            // and to allow aborting the operation in between chunks
            const convertedChunk = await Promise.all(chunk.map(async resource => {
                const recordToWrite = await recordConverter(resource, connection);

                const existing = existingRecordsById.get(resource.id);

                if (existing) {
                    if (JSON.stringify(existing) === JSON.stringify(recordToWrite)) {
                        return undefined;
                    }
                }

                return recordToWrite;
            }));

            recordsToWrite.push(...convertedChunk.filter(r => r !== undefined) as ResourceStoredType<TResourceName>[]);
        }

        return recordsToWrite;
    };
}
