import type {Connection} from '../connection/connection.js';
import type {resources} from '../../HawkiClient.js';

export type ResourceDefinition<TResource, TStoredResource = TResource> = {
    /**
     * If true, the resource will not be persisted to indexedDB.
     * This is useful for resources that are only needed in memory, or for resources that are frequently updated.
     * Default is false.
     */
    transient?: boolean;
    /**
     * A transformer function to convert the resource into a format suitable for storage.
     * This can be used to load date objects, or enhance the resource with additional data for indexing.
     * If not provided, the resource will be stored as-is.
     * @param resource
     */
    toStoredResource?: (resource: TResource, connection: Connection) => TStoredResource | Promise<TStoredResource>;
    /**
     * A list of keys to index in the indexedDB.
     * These keys must be part of the resource, and should be the keys that are most commonly queried.
     * The key name in the tuple is used as the index name in the indexedDB.
     */
    indexedKeys?: (keyof TStoredResource)[],
    /**
     * For some operations it is useful to have compound indexes (e.g. for queries with multiple conditions).
     * This is an array of arrays of keys that should be indexed together.
     * Each inner array is a list of keys that form a compound index.
     * The keys must be part of the indexedKeys.
     * If not provided, no compound indexes will be created.
     * example: [['first_name', 'last_name'], ['status', 'created_at']]
     */
    compoundIndexes?: (keyof TStoredResource | string)[][],
}

export type ResourceName = keyof typeof resources;
export type PersistedResourceName = {
    [K in ResourceName]:
    (typeof resources)[K] extends { transient: true }
        ? never
        : K
}[ResourceName];
type DefinedResource<TName extends ResourceName> = (typeof resources)[TName];

export type ResourceType<TName extends ResourceName> =
    DefinedResource<TName> extends ResourceDefinition<infer R, any>
        ? R & { id: number }
        : never;

export type ResourceStoredType<TName extends ResourceName> =
    DefinedResource<TName> extends ResourceDefinition<any, infer S>
        ? S & { id: number }
        : ResourceType<TName>; // Fallback in case it's not defined

export function defineResource<TResource extends { id: number }>() {
    return function <
        const TDef extends ResourceDefinition<TResource, any>
    >(
        definition?: TDef
    ): ResourceDefinition<
        TResource,
        TDef extends { toStoredResource: (...args: any) => infer R }
            ? Awaited<R>
            : TResource
    > & TDef {
        return definition || {} as any;
    };
}
