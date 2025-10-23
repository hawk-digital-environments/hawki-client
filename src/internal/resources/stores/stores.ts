export type ReactiveStoreSubscriber<T, TInitial> = (value: T | TInitial) => void;

/**
 * This is a simple reactive store contract.
 * It allows subscribing to changes, setting new values, and getting the current value.
 * It also supports cleanup functions that are called when there are no more subscribers.
 */
export interface ReactiveStore<T, TInitial> {

    /**
     * Subscribe to changes in the store.
     * The subscriber function will be called whenever the store's value changes.
     * If `immediate` is true (default), the subscriber will be called immediately with the current value if it exists.
     * The function returns an unsubscribe function that can be called to stop receiving updates.
     * @param run
     * @param immediate
     */
    subscribe: (run: ReactiveStoreSubscriber<T, TInitial>, immediate?: boolean) => () => void;

    /**
     * Indicates whether the store has been set at least once.
     * If this is false, the store is in its initial state.
     */
    wasSet: boolean;

    /**
     * Set a new value for the store.
     * This will notify all subscribers of the new value.
     * @param value
     */
    set: (value: T | TInitial) => void;

    /**
     * Get the current value of the store.
     * If the store has never been set and no default value is provided, it returns the initial value (which may be undefined).
     */
    get(): T | TInitial;

    /**
     * Get the current value of the store.
     * If the store has never been set, it returns the provided default value instead.
     * This is useful for avoiding undefined values when the store is in its initial state.
     * @param defaultValue
     */
    get<D>(defaultValue: D): T | D;

    /**
     * Register a cleanup function that will be called when there are no more subscribers.
     * This is useful for cleaning up resources or listeners that are only needed while there are active subscribers.
     * The function returns an unregister function that can be called to remove the cleanup function if needed.
     * @param cleanup
     */
    onCleanup: (cleanup: () => void) => () => void;
}
