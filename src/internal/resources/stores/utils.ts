/**
 * Filters out undefined and null values from an array.
 * @param array The input array
 * @returns A new array containing only defined and non-null values
 */
export function filterUndefinedAndNull<T>(array: Array<T | undefined | null>): T[] {
    return array.filter((item): item is T => item !== undefined && item !== null);
}

/**
 * Filters out undefined and null values from an array or a promise of an array.
 * @param input The input array or a promise of an array
 * @returns A promise of a new array containing only defined and non-null values
 */
export async function filterUndefinedAndNullAsync<T>(
    input: Array<Promise<T | undefined | null>> | Promise<Array<T | undefined | null>>
): Promise<T[]> {
    return filterUndefinedAndNull(Array.isArray(input) ? await Promise.all(input) : await input);
}

/**
 * Generates a unique key based on the provided limit and offset constraints.
 * @param constraints
 */
export function limitAndOffsetKey(constraints: { limit?: number; offset?: number } | undefined): string {
    return `l${constraints?.limit ?? 'n'}o${constraints?.offset ?? 'n'}`;
}

/**
 * Applies limit and offset constraints to an array.
 * @param array The input array
 * @param constraints The limit and offset constraints
 * @returns A new array with the applied constraints
 */
export function limitAndOffset<T>(array: T[], constraints: { limit?: number; offset?: number } | undefined): T[] {
    let result = array;
    if (constraints?.offset) {
        result = result.slice(constraints.offset);
    }
    if (constraints?.limit) {
        result = result.slice(0, constraints.limit);
    }
    return result;
}

/**
 * Helper to use in "derive" calls to create a Map from an array.
 * The keyFunction is used to extract the key from each item.
 * @param value The input array from which to create the map
 * @param keyFunction A function that takes an item and returns its key
 * @returns A Map where each key is derived from the items in the array
 */
export function deriveMap<TValue extends Array<any> = any, TKey = any>(
    value: TValue,
    keyFunction: (item: TValue extends Array<infer U> ? U : any) => TKey
): Map<TKey, TValue extends Array<infer U> ? U : any> {
    const map = new Map<TKey, TValue extends Array<infer U> ? U : any>();
    for (const item of value) {
        const key = keyFunction(item);
        map.set(key, item);
    }
    return map;
}
