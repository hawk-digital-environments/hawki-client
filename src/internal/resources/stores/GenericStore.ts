import type {ReactiveStore, ReactiveStoreSubscriber} from './stores.js';

export function createGenericStore<TValue = any>(initialValue?: undefined): ReactiveStore<TValue, undefined>;
export function createGenericStore<TInitialValue = any, TValue = TInitialValue>(initialValue: TInitialValue): ReactiveStore<TValue, TInitialValue>;

/**
 * The GenericStore is a simple reactive store that can hold any type of value.
 * @param initialValue
 */
export function createGenericStore<TValue = any, TInitialValue = any>(initialValue: TInitialValue): ReactiveStore<TValue, TInitialValue> {
    let value: TValue | TInitialValue = initialValue;
    let wasSet = initialValue !== undefined;
    const subscribers = new Set<ReactiveStoreSubscriber<TValue, TInitialValue>>();
    const cleanupFunctions = new Set<() => void>();
    let cleanupTimeout: ReturnType<typeof setTimeout> = 0;

    // Use closures for all methods
    const onCleanup = (cleanup: () => void) => {
        cleanupFunctions.add(cleanup);
        return () => {
            cleanupFunctions.delete(cleanup);
        };
    };

    const runCleanup = () => {
        clearTimeout(cleanupTimeout!);
        // I wrapped the cleanup in a timeout, so if a subscriber immediately re-subscribes, we do not run the cleanup
        // This may happen when a single-page app navigates between pages that use the same store
        cleanupTimeout = setTimeout(() => {
            for (const cleanup of cleanupFunctions) {
                cleanup();
            }
            cleanupFunctions.clear();
        }, 200);
    };

    const subscribe = (
        run: ReactiveStoreSubscriber<TValue, TInitialValue>,
        immediate: boolean = true
    ) => {
        clearTimeout(cleanupTimeout!);
        subscribers.add(run);
        if (immediate && value !== undefined) {
            run(value);
        }
        return () => {
            subscribers.delete(run);
            if (subscribers.size === 0) {
                runCleanup();
            }
        };
    };

    const set = (newValue: TValue | TInitialValue) => {
        wasSet = true;
        value = newValue;
        for (const subscriber of subscribers) {
            subscriber(value);
        }
    };

    const get = <D>(defaultValue?: D) => {
        if (defaultValue === undefined) {
            return value as TValue | TInitialValue;
        }
        if (value === initialValue) {
            return defaultValue;
        }
        return value;
    };

    return {
        get wasSet() {
            return wasSet;
        },
        subscribe,
        set,
        get,
        onCleanup
    };
}
