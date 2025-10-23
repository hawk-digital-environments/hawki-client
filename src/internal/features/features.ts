import type {Connection} from '../connection/connection.js';
import {type features, type HawkiClientOptions} from '../../HawkiClient.js';

export type FeatureKey = keyof typeof features;
export type Feature<K extends FeatureKey> = Awaited<ReturnType<typeof features[K]>>
export type FeatureInstances = {
    [K in FeatureKey]: Feature<K>;
};

export type FeatureProvider<T = any> = (connection: Connection, options: HawkiClientOptions) => T | Promise<T>;

export function defineFeature<T>(provider: FeatureProvider<T>): FeatureProvider<T> {
    return provider;
}
