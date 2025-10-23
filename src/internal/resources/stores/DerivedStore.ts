import type {ReactiveStore} from './stores.js';
import {createGenericStore} from './GenericStore.js';
import type {ReactiveStoreFront} from './ReactiveStoreFront.js';

export type ExtractStoreValues<T extends readonly (ReactiveStore<any, any> | ReactiveStoreFront<any>)[]> = {
    [K in keyof T]: T[K] extends ReactiveStore<infer V, any>
        ? V
        : T[K] extends ReactiveStoreFront<infer V>
            ? V
            : never;
};

export function createDerivedStore<
    const TInputs extends readonly (ReactiveStore<any, any> | ReactiveStoreFront<any>)[],
    TValueDerived = any
>(
    storesOrFronts: TInputs,
    deriveFunction: (...args: ExtractStoreValues<TInputs>) => TValueDerived | Promise<TValueDerived>,
    initialValue?: undefined
): ReactiveStore<TValueDerived, undefined>

export function createDerivedStore<
    const TInputs extends readonly (ReactiveStore<any, any> | ReactiveStoreFront<any>)[],
    TValueDerived = any,
    TValueDerivedInitial = any
>(
    storesOrFronts: TInputs,
    deriveFunction: (...args: ExtractStoreValues<TInputs>) => TValueDerived | Promise<TValueDerived>,
    initialValue: TValueDerivedInitial
): ReactiveStore<TValueDerived, TValueDerivedInitial>

/**
 * Creates a derived reactive store that computes its value based on other stores or store fronts.
 * The derived store updates its value whenever any of the input stores change.
 *
 * The deriveFunction will only be called when all input stores have been set at least once.
 *
 * @param storesOrFronts An array of ReactiveStore or ReactiveStoreFront instances to derive from.
 * @param deriveFunction A function that takes the current values of the input stores and returns the derived value.
 * @param initialValue An optional initial value for the derived store.
 * @return A new ReactiveStore instance that holds the derived value.
 */
export function createDerivedStore<
    const TInputs extends readonly (ReactiveStore<any, any> | ReactiveStoreFront<any>)[],
    TValueDerived = any,
    TValueDerivedInitial = any
>(
    storesOrFronts: TInputs,
    deriveFunction: (...args: ExtractStoreValues<TInputs>) => TValueDerived | Promise<TValueDerived>,
    initialValue?: TValueDerivedInitial
): ReactiveStore<TValueDerived, TValueDerivedInitial> {
    const derivedStore = createGenericStore<TValueDerivedInitial, TValueDerived>(initialValue as any);
    const unsubscribers: (() => void)[] = [];
    let currentCombineId = 0;
    let hasBeenStarted = false;

    const stores = storesOrFronts.map((item) => {
        if ('store' in item && typeof item.store === 'function') {
            return (item as ReactiveStoreFront<any>).store();
        }
        return item as ReactiveStore<any, any>;
    });

    const derive = () => {
        // Mark that we have started at least once, so we do not call derive again after setting up subscriptions
        hasBeenStarted = true;

        const combineId = ++currentCombineId;
        const values = stores.map(store => store.get());

        // If any of the stores does not have its "hasSet" flag set to true, we cannot compute the combined value yet
        if (stores.some(store => !store.wasSet)) {
            return;
        }

        const definedValues = values as ExtractStoreValues<TInputs>;

        Promise.resolve(deriveFunction(...definedValues)).then(combinedValue => {
            // If a new computation has started in the meantime, ignore this result
            if (combineId !== currentCombineId) {
                return;
            }
            derivedStore.set(combinedValue);
        });
    };

    for (const store of stores) {
        // "false" here means "do not call the listener immediately with the current value, only on changes"
        // This is important to avoid calling "derive" multiple times during initialization
        // because we already call it once after setting up all subscriptions
        // and calling it multiple times would lead to unnecessary computations
        const unsubscribe = store.subscribe(() => derive(), false);
        unsubscribers.push(unsubscribe);
    }

    if (!hasBeenStarted) {
        derive();
    }

    derivedStore.onCleanup(() => {
        for (const unsubscribe of unsubscribers) {
            unsubscribe();
        }
    });

    return derivedStore;
}
