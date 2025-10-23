import type {ResourceName, ResourceType} from '../resources.js';

export interface SyncLog {
    type: 'full' | 'incremental';
    log: SyncLogEntry[];
}

export interface SetSyncLogEntry<T extends ResourceName> {
    type: T;
    action: 'set';
    resource: ResourceType<T>;
    resource_id: number;
    timestamp: string;
}

export interface RemoveSyncLogEntry<T extends ResourceName> {
    type: T;
    action: 'remove';
    resource?: ResourceType<T>;
    resource_id: number;
    timestamp: string;
}

export type SyncLogEntry<T extends ResourceName = any> = SetSyncLogEntry<T> | RemoveSyncLogEntry<T>;
