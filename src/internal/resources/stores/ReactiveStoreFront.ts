import type {ReactiveStore, ReactiveStoreSubscriber} from './stores.js';
import {
    createPromiseForStore,
    createPromiseToResolveWhenValueNotNullOrUndefined
} from './storePromises.js';
import {createDerivedStore, type ExtractStoreValues} from './DerivedStore.js';

/**
 * A ReactiveStoreFront is a lightweight interface to give a ReactiveStore superpowers.
 * While it handles like a ReactiveStore, it can lazily create the underlying store when needed,
 * and it can derive new stores from itself and other stores. This makes it easy to create
 * complex reactive data flows without having to manage the lifecycle of each store manually.
 *
 * It also supports async getters with timeouts, which can be useful for waiting for data to be available.
 *
 * The ReactiveStoreFront is designed to be used in scenarios where you want to expose a store-like
 * interface without immediately instantiating the store, or when you want to create derived stores
 * that depend on multiple other stores.
 *
 * @template TValue The type of the value held by the store.
 * @template TValueInitial The type of the initial value of the store (if any).
 */
export interface ReactiveStoreFront<TValue = any, TValueInitial = any> {
    /**
     * Get the underlying ReactiveStore instance.
     * This will create the store if it does not already exist.
     * Use this method when you need direct access to the store's methods or properties
     * that are not exposed by the ReactiveStoreFront interface.
     * @returns The underlying ReactiveStore instance.
     */
    store(): ReactiveStore<TValue, TValueInitial>;

    /**
     * @see ReactiveStore.subscribe
     */
    subscribe: ReactiveStore<TValue, TValueInitial>['subscribe'];

    /**
     * @see ReactiveStore.wasSet
     */
    wasSet: ReactiveStore<TValue, TValueInitial>['wasSet'];

    /**
     * @see ReactiveStore.get
     */
    get: ReactiveStore<TValue, TValueInitial>['get'];

    /**
     * @see ReactiveStore.set
     */
    set: ReactiveStore<TValue, TValueInitial>['set'];

    /**
     * Get the current value of the store asynchronously.
     * If the store has never been set, this will wait until it is set or until the timeout is reached.
     * If a timeout is provided and reached before the store is set, the promise will resolve to undefined.
     * If no timeout is provided, it will wait indefinitely until the store is set.
     * This is useful for scenarios where you need to ensure that a value is available before proceeding,
     * but you also want to avoid blocking indefinitely if the value may never be set.
     *
     * @returns A promise that resolves to the current value of the store, or undefined if not set within the timeout.
     * @param timeoutMs Optional timeout in milliseconds to wait for the store to be set. If not provided, it will wait indefinitely.
     */
    getAsync(timeoutMs?: number): Promise<TValue | TValueInitial>;

    /**
     * Quite similar to getAsync, but this method will only resolve as soon as the store's value is neither null nor undefined.
     * If the store is already set to a non-null/undefined value, it will resolve immediately.
     * If a timeout is provided and reached before the store's value becomes non-null/undefined,
     * the promise will reject with an error.
     * This is particularly useful in scenarios where you need to ensure that a valid value is available
     * before proceeding, and you want to avoid dealing with null or undefined values.
     *
     * @returns A promise that resolves to the current non-null/undefined value of the store.
     *          If the timeout is reached before such a value is available, the promise rejects with an error.
     * @param timeoutMs Optional timeout in milliseconds to wait for a non-null/undefined value. If not provided, it will wait indefinitely.
     * @param timeoutMessage Optional custom message for the timeout error if the promise rejects due to a timeout.
     */
    getAsyncAsserted(timeoutMs?: number, timeoutMessage?: string): Promise<NonNullable<TValue | TValueInitial>>;

    derive<const TInputs extends readonly (ReactiveStore<any, any> | ReactiveStoreFront<any>)[], TValueDerived = any, TValueDerivedInitial = any>(
        key: string,
        deriveFunction: (value: TValue, ...otherValues: ExtractStoreValues<TInputs>) => TValueDerived | Promise<TValueDerived>,
        otherStores?: TInputs,
        initialValue?: undefined
    ): ReactiveStoreFront<TValueDerived, undefined>;

    /**
     * Create a derived ReactiveStoreFront that computes its value based on this store and other provided stores.
     * The derived store will automatically update its value whenever any of the source stores change.
     * This is useful for creating complex data flows where the value of one store depends on the values of others.
     * @param key A unique key to identify the derived store. This is used to cache and reuse the derived store if the same key is used again.
     * @param deriveFunction A function that takes the current value of this store and the values of the other stores,
     *                      and returns the derived value. This function can return a value directly or a Promise that resolves to the value.
     * @param otherStores An optional array of other ReactiveStore or ReactiveStoreFront instances that the derived store depends on.
     *                    If not provided, the derived store will only depend on this store.
     * @param initialValue An optional initial value for the derived store. This is used until the deriveFunction produces a value.
     *                     If not provided, the derived store will have an initial value of undefined.
     * @returns A new ReactiveStoreFront instance representing the derived store.
     */
    derive<const TInputs extends readonly (ReactiveStore<any, any> | ReactiveStoreFront<any>)[], TValueDerived = any, TValueDerivedInitial = any>(
        key: string,
        deriveFunction: (value: TValue, ...otherValues: ExtractStoreValues<TInputs>) => TValueDerived | Promise<TValueDerived>,
        otherStores?: TInputs,
        initialValue?: TValueDerivedInitial
    ): ReactiveStoreFront<TValueDerived, TValueDerivedInitial>;
}

export function createStoreFront<TValue = any, TValueInitial = any>(
    storeFactory: () => ReactiveStore<TValue, TValueInitial>
) {
    let store: ReactiveStore<TValue, TValueInitial> | null = null;
    const storeGetter = (): ReactiveStore<TValue, TValueInitial> => {
        if (store !== null) {
            return store;
        }
        store = storeFactory();

        store.onCleanup(() => {
            derivedFronts.clear();
            store = null;
        });

        return store;
    };

    const set = (value: TValue | TValueInitial) => storeGetter().set(value);
    const subscribe = (run: ReactiveStoreSubscriber<TValue, TValueInitial>, immediate?: boolean) => storeGetter().subscribe(run, immediate);
    const get = () => storeGetter().get();
    const wasSet = () => storeGetter().wasSet;
    const getAsync = (timeoutMs?: number) =>
        createPromiseForStore<TValue, TValueInitial>(storeGetter(), timeoutMs);
    const getAsyncAsserted = (timeoutMs?: number, timeoutMessage?: string) =>
        createPromiseToResolveWhenValueNotNullOrUndefined(storeGetter(), timeoutMs, timeoutMessage || 'Timed out waiting for asserted store value');

    const derivedFronts = new Map<string, ReactiveStoreFront>();
    const derive = <const TInputs extends readonly (ReactiveStore<any, any> | ReactiveStoreFront<any>)[], TValueDerived = any, TValueDerivedInitial = any>(
        key: string,
        deriveFunction: (value: TValue, ...otherValues: ExtractStoreValues<TInputs>) => TValueDerived | Promise<TValueDerived>,
        otherStores: TInputs = [] as unknown as TInputs,
        initialValue?: TValueDerivedInitial
    ): ReactiveStoreFront<TValueDerived, TValueDerivedInitial> => {
        if (derivedFronts.has(key)) {
            return derivedFronts.get(key)!;
        }

        const derivedFront = createStoreFront<TValueDerived, TValueDerivedInitial>(
            () => {
                const derivedStore = createDerivedStore<TInputs, TValueDerived, TValueDerivedInitial>(
                    [storeGetter(), ...otherStores] as any as TInputs,
                    // @ts-ignore
                    (...values) => deriveFunction(...values),
                    initialValue as TValueDerivedInitial
                );

                derivedStore.onCleanup(() => {
                    derivedFronts.delete(key);
                });

                return derivedStore;
            }
        );

        derivedFronts.set(key, derivedFront);

        return derivedFront;
    };

    return {
        store: storeGetter,
        set,
        get,
        getAsync,
        getAsyncAsserted,
        subscribe,
        derive,
        get wasSet() {
            return wasSet();
        }
    } satisfies ReactiveStoreFront<TValue, TValueInitial>;
}

export type ReactiveStoreFrontProvider<TValue = any, TFilter = any> = ReturnType<typeof createStoreFrontProvider<TValue, TFilter>>;

export function createStoreFrontProvider<TValue = any, TFilter = any, TValueInitial = any>(
    storeFactory: (filter: TFilter | undefined, key: string) => ReactiveStore<TValue, TValueInitial>
) {
    const fronts = new Map<string, ReactiveStoreFront>();
    const cleanups = new Map<string, () => void>();

    const get = (key: string, filter?: TFilter): ReactiveStoreFront<TValue, TValueInitial> => {
        if (fronts.has(key)) {
            return fronts.get(key)!;
        }

        const front = createStoreFront<TValue, TValueInitial>(() => {
            const store = storeFactory(filter ?? undefined, key);
            cleanups.set(key, store.onCleanup(() => fronts.delete(key)));
            return store;
        });

        fronts.set(key, front);

        return front;
    };

    const remove = (key: string) => {
        if (fronts.has(key)) {
            cleanups.get(key)?.();
            fronts.delete(key);
        }
    };

    const clear = () => {
        for (const key of fronts.keys()) {
            cleanups.get(key)?.();
            remove(key);
        }
    };

    return {
        get,
        remove,
        clear
    };
}
