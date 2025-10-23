import type {ReactiveStore} from './stores.js';

/**
 * Creates a promise that resolves when the store is set, or immediately if it was already set.
 * If a timeout is provided, it will resolve with the current value after the timeout.
 * This MAY resolve immediately OR take a lot of time, depending on when the store value is set.
 *
 * @param store
 * @param timeoutMs
 */
export function createPromiseForStore<TValue, TValueInitial>(store: ReactiveStore<TValue, TValueInitial>, timeoutMs?: number) {
    return createPromisedStoreWatcher<TValue | TValueInitial, TValue, TValueInitial>(
        store,
        // @ts-ignore
        () => true,
        timeoutMs
    );
}

/**
 * Creates a promise that resolves when the store value is not null or undefined.
 * If a timeout is provided, it will reject if the value is not set within the timeout.
 * This MAY resolve immediately OR take a lot of time, depending on when the store value is set.
 *
 * @param store The reactive store to monitor
 * @param timeoutMs Optional timeout in milliseconds
 * @param timeoutMessage Optional message to include in the timeout error
 */
export function createPromiseToResolveWhenValueNotNullOrUndefined<TValue, TValueInitial>(store: ReactiveStore<TValue, TValueInitial>, timeoutMs?: number, timeoutMessage?: string) {
    return createPromisedStoreWatcher<NonNullable<TValue | TValueInitial>, TValue, TValueInitial>(
        store,
        (value): value is NonNullable<TValue | TValueInitial> => value !== undefined && value !== null,
        timeoutMs,
        timeoutMessage
    );
}

function createPromisedStoreWatcher<TResult extends TValue | TValueInitial, TValue, TValueInitial>(
    store: ReactiveStore<TValue, TValueInitial>,
    handle: (value: TValue | TValueInitial) => value is TResult,
    timeoutMs?: number,
    timeoutMessage?: string
) {
    if (store.wasSet) {
        const value = store.get();
        if (handle(value)) {
            return Promise.resolve(value);
        }
    }
    return new Promise<TResult>((resolve, reject) => {
        let unsubscribe: () => void | undefined;
        let timeout: ReturnType<typeof setTimeout> | undefined;
        if (timeoutMs !== undefined) {
            timeout = setTimeout(() => {
                if (unsubscribe) {
                    unsubscribe();
                }
                if (timeoutMessage) {
                    reject(new Error(`Timeout waiting ${timeoutMs}ms for store value${timeoutMessage ? `: ${timeoutMessage}` : ''}`));
                    return;
                }
                resolve(store.get() as TResult);
            }, timeoutMs);
        }

        let unsubscribeImmediately = false;
        unsubscribe = store.subscribe((value) => {
            if (!handle(value)) {
                return;
            }
            if (timeout) {
                clearTimeout(timeout);
            }
            resolve(value);
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            } else {
                unsubscribeImmediately = true;
            }
        });

        if (unsubscribeImmediately) {
            unsubscribe();
        }
    });

}
