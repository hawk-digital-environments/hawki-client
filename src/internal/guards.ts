/**
 * Checks if the value is a non-null object (but not an array).
 * @param value
 */
export function isObject(value: any): value is Record<string, any> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Checks if the value is a non-empty string (not just whitespace).
 * @param value
 */
export function isNonEmptyString(value: any): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Checks if the value is a record (object) where all values satisfy the provided guard function.
 * @param value
 * @param guard
 */
export function isRecordOf<T>(value: any, guard: (val: any) => val is T): value is Record<string, T> {
    if (!isObject(value)) {
        return false;
    }
    return Object.values(value).every(guard);
}

/**
 * Checks if the value is a record (object) where all values are strings.
 * @param value
 */
export function isRecordOfStrings(value: any): value is Record<string, string> {
    return isRecordOf(value, val => typeof val === 'string');
}

/**
 * Checks if the value is an array where all items are strings.
 * @param value
 */
export function isArrayOfStrings(value: any): value is string[] {
    return Array.isArray(value) && value.every(item => typeof item === 'string');
}

/**
 * Checks if the value is a positive integer (greater than 0).
 * @param value
 */
export function isPositiveInteger(value: any): value is number {
    return Number.isInteger(value) && value > 0;
}

/**
 * Checks if the value is a non-negative integer (0 or greater).
 * @param value
 */
export function isNonNegativeInteger(value: any): value is number {
    return Number.isInteger(value) && value >= 0;
}

/**
 * Checks if the value is a boolean.
 * @param value
 */
export function isBoolean(value: any): value is boolean {
    return typeof value === 'boolean';
}

type GuardErrorFactory = (message: string, key: string) => Error;

/**
 * Gets a property from an object and validates it using the provided guard function.
 * If the property is missing or invalid, it throws an error created by the onError function.
 *
 * @param obj The object to get the property from
 * @param key The property key to get
 * @param guard The guard function to validate the property
 * @param message The error message to use if the property is missing or invalid (forwarded to onError)
 * @param onError Optional function to create the error to throw (defaults to a generic Error)
 * @returns The validated property value
 * @throws An error if the property is missing or invalid
 */
export function getGuardedProperty<T = any>(
    obj: Record<string, any>,
    key: string,
    guard: (value: T) => value is T,
    message: string,
    onError: GuardErrorFactory = (m, k) => new Error(`Invalid property "${k}": ${m}`)
): T {
    if (!(key in obj)) {
        throw onError(message, key);
    }
    if (!guard(obj[key])) {
        throw onError(message, key);
    }
    return obj[key];
}

/**
 * Gets a property from an object and ensures it is a non-null object (not an array).
 * If the property is missing or not an object, it throws an error.
 * @param obj The object to get the property from
 * @param key The property key to get
 * @param onError Optional function to create the error to throw
 * @returns The property value as an object
 * @throws An error if the property is missing or not an object
 */
export function getGuardedObjectProperty(
    obj: Record<string, any>,
    key: string,
    onError?: GuardErrorFactory
): Record<string, any> {
    return getGuardedProperty(obj, key, isObject, `${key} is missing or not an object`, onError);
}

/**
 * Gets a property from an object and ensures it is a non-empty string.
 * If the property is missing or not a non-empty string, it throws an error.
 * @param obj The object to get the property from
 * @param key The property key to get
 * @param onError Optional function to create the error to throw
 * @returns The property value as a non-empty string
 * @throws An error if the property is missing or not a non-empty string
 */
export function getGuardedNonEmptyStringProperty(
    obj: Record<string, any>,
    key: string,
    onError?: GuardErrorFactory
): string {
    return getGuardedProperty(obj, key, isNonEmptyString, `${key} is missing or an empty string`, onError);
}

/**
 * Gets a property from an object and ensures it is a record of strings.
 * If the property is missing or not a record of strings, it throws an error.
 * @param obj The object to get the property from
 * @param key The property key to get
 * @param onError Optional function to create the error to throw
 * @returns The property value as a record of strings
 * @throws An error if the property is missing or not a record of strings
 */
export function getGuardedRecordOfStringsProperty(
    obj: Record<string, any>,
    key: string,
    onError?: GuardErrorFactory
): Record<string, string> {
    return getGuardedProperty(obj, key, isRecordOfStrings, `${key} is missing or not a record of strings`, onError);
}

/**
 * Gets a property from an object and ensures it is a record where all values satisfy the provided guard function.
 * If the property is missing or not a valid record, it throws an error.
 *
 * @param obj The object to get the property from
 * @param key The property key to get
 * @param guard The guard function to validate each value in the record
 * @param onError Optional function to create the error to throw
 * @returns The property value as a record of the specified type
 * @throws An error if the property is missing or not a valid record
 */
export function getGuardedRecordOf<T = any>(
    obj: Record<string, any>,
    key: string,
    guard: (value: any) => value is T,
    onError?: GuardErrorFactory
): Record<string, T> {
    return getGuardedProperty<Record<string, T>>(
        obj,
        key,
        (value): value is Record<string, T> => isRecordOf<T>(value, guard),
        `${key} is missing or not a record`,
        onError
    );
}

/**
 * Gets a property from an object and ensures it is an array of strings.
 * If the property is missing or not an array of strings, it throws an error.
 * @param obj The object to get the property from
 * @param key The property key to get
 * @param onError Optional function to create the error to throw
 * @returns The property value as an array of strings
 * @throws An error if the property is missing or not an array of strings
 */
export function getGuardedArrayOfStringsProperty(
    obj: Record<string, any>,
    key: string,
    onError?: GuardErrorFactory
): string[] {
    return getGuardedProperty(obj, key, isArrayOfStrings, `${key} is missing or not an array of strings`, onError);
}

/**
 * Gets a property from an object and ensures it is a positive integer.
 * If the property is missing or not a positive integer, it throws an error.
 * @param obj The object to get the property from
 * @param key The property key to get
 * @param onError Optional function to create the error to throw
 * @returns The property value as a positive integer
 * @throws An error if the property is missing or not a positive integer
 */
export function getGuardedPositiveIntegerProperty(
    obj: Record<string, any>,
    key: string,
    onError?: GuardErrorFactory
): number {
    return getGuardedProperty(obj, key, isPositiveInteger, `${key} is missing or not a positive integer`, onError);
}

/**
 * Gets a property from an object and ensures it is a non-negative integer.
 * If the property is missing or not a non-negative integer, it throws an error.
 * @param obj The object to get the property from
 * @param key The property key to get
 * @param onError Optional function to create the error to throw
 * @returns The property value as a non-negative integer
 * @throws An error if the property is missing or not a non-negative integer
 */
export function getGuardedNonNegativeIntegerProperty(
    obj: Record<string, any>,
    key: string,
    onError?: GuardErrorFactory
): number {
    return getGuardedProperty(obj, key, isNonNegativeInteger, `${key} is missing or a negative integer`, onError);
}

/**
 * Gets a property from an object and ensures it is a boolean.
 * If the property is missing or not a boolean, it throws an error.
 * @param obj The object to get the property from
 * @param key The property key to get
 * @param onError Optional function to create the error to throw
 * @returns The property value as a boolean
 * @throws An error if the property is missing or not a boolean
 */
export function getGuardedBooleanProperty(
    obj: Record<string, any>,
    key: string,
    onError?: GuardErrorFactory
): boolean {
    return getGuardedProperty(obj, key, isBoolean, `${key} is missing or not a boolean`, onError);
}
