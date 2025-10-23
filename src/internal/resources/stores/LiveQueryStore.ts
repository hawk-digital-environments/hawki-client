import {liveQuery} from 'dexie';
import type {ReactiveStore} from './stores.js';
import {createGenericStore} from './GenericStore.js';
import type {Logger} from '../../logger.js';

/**
 * Creates a reactive store that updates its value based on the result of a live query.
 * The store will automatically update whenever the underlying data changes.
 *
 * @template T The type of data returned by the query function.
 * @param log
 * @param queryFunction
 */
export function createLiveQueryStore<T>(
    log: Logger,
    queryFunction: () => T | Promise<T>
): ReactiveStore<T, undefined> {
    const concreteStore = createGenericStore<T>();

    const query = liveQuery<T>(queryFunction);

    const cleanupQuery = query.subscribe({
        next(data) {
            concreteStore.set(data);
        },
        error(err) {
            log.error(`Error in live query store: ${err}`, err);
        }
    });

    concreteStore.onCleanup(() => {
        cleanupQuery.unsubscribe();
    });

    return concreteStore;
}
