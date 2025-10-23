import type {PersistedResourceName, ResourceName, ResourceType} from '../../resources.js';
import {type Collection} from 'dexie';

export type WriterQueueIdProvider =
    number
    | number[]
    | (() => number | Promise<number> | number[] | Promise<number[]> | Collection<{ id: number }> | Promise<Collection<{
    id: number
}>>);

export type WriterQueueProvider = ReturnType<typeof createWriterQueueProvider>;

export function createWriterQueueProvider() {
    const queues = new Map<PersistedResourceName, ReturnType<typeof createWriterQueue>>();

    const get = <TResourceName extends PersistedResourceName>(tableName: TResourceName) => {
        if (!queues.has(tableName)) {
            queues.set(tableName, createWriterQueue<TResourceName>());
        }
        return queues.get(tableName)!;
    };

    return {
        get
    };
}

type SetActionItem<TResourceName extends PersistedResourceName> = {
    action: 'set',
    id: number,
    record: ResourceType<TResourceName>
};

type RemoveActionItem = {
    action: 'remove',
    target: () => Promise<number[]>
};
type ActionItem<TResourceName extends PersistedResourceName> = SetActionItem<TResourceName> | RemoveActionItem;

function createWriterQueue<TResourceName extends PersistedResourceName>() {
    const actions = new Set<ActionItem<TResourceName>>;
    let done: {
        resolve: () => void,
        reject: (error: any) => void,
        promise: Promise<void>
    } | null = null;

    const getOrInitializeDone = () => {
        if (done === null) {
            let resolve!: () => void;
            let reject!: (error: any) => void;
            const promise = new Promise<void>((res, rej) => {
                resolve = () => res();
                reject = rej;
            });
            done = {resolve, reject, promise};
        }
        return done;
    };

    const collectSet = (id: number, record: ResourceType<TResourceName>): Promise<void> => {
        actions.add({action: 'set', id, record});
        return getOrInitializeDone().promise;
    };

    const collectRemove = (idProvider: WriterQueueIdProvider): Promise<void> => {
        if (typeof idProvider !== 'function') {
            const _idProvider = idProvider;
            idProvider = () => _idProvider as number | number[];
        }
        actions.add({
            action: 'remove', target: async () => {
                // This will handle both promise and non-promise return values
                const providerResult = await idProvider();

                // Convert dexie Collection to array of ids
                if (typeof providerResult === 'object' && 'toArray' in providerResult && typeof providerResult.toArray === 'function') {
                    const collection = providerResult as Collection<{ id: number }>;
                    const all = await collection.toArray();
                    return all.map(r => r.id);
                }

                if (Array.isArray(providerResult)) {
                    return providerResult;
                }

                if (typeof providerResult === 'number') {
                    return [providerResult];
                }

                throw new Error('Invalid idProvider result type');
            }
        });

        return getOrInitializeDone().promise;
    };

    const getClean = async () => {
        // If no actions, return undefined -> nothing to process
        if (actions.size === 0) {
            return undefined;
        }

        const actionsToProcess = Array.from(actions);
        actions.clear();
        const _done = getOrInitializeDone();
        done = null;

        const resolve = _done.resolve;
        const reject = _done.reject;

        const setActions = new Map<number, any>();
        const removeActions = new Map<number, number>();

        for (const action of actionsToProcess) {
            if (action.action === 'set') {
                removeActions.delete(action.id);
                setActions.set(action.id, action.record);
            } else if (action.action === 'remove') {
                const ids = await action.target();
                for (const id of ids) {
                    setActions.delete(id);
                    removeActions.set(id, id);
                }
            } else {
                throw new Error('Unknown action type');
            }
        }

        const recordsToSet: ResourceType<ResourceName>[] = [];
        const idsToSet: number[] = [];
        const idsToRemove: number[] = [];

        for (const [id, record] of setActions) {
            recordsToSet.push(record);
            idsToSet.push(id);
        }

        for (const id of removeActions.keys()) {
            idsToRemove.push(id);
        }

        setActions.clear();
        removeActions.clear();

        return {
            recordsToSet,
            idsToSet,
            idsToRemove,
            resolve,
            reject
        };
    };

    const clear = () => {
        actions.clear();
        if (done) {
            done.resolve();
            done = null;
        }
    };

    return {
        collectSet,
        collectRemove,
        getClean,
        clear
    };
}
