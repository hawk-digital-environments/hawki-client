import type {CommonConnectionConfig} from '../connection/connection.js';

type FeatureKey = keyof CommonConnectionConfig['featureFlags'];

export type FeatureFlags = ReturnType<typeof createFeatureFlags>;

export function createFeatureFlags(config: CommonConnectionConfig['featureFlags']) {
    // noinspection PointlessBooleanExpressionJS
    /**
     * Check if a feature is enabled
     */
    const isEnabled = (feature: FeatureKey) =>
        config[feature] === true;

    /**
     * Executes the given function if the feature is enabled, otherwise does nothing and returns undefined.
     * Use runIfEnabledOrFail if you want to throw an error when the feature is not enabled.
     */
    const runIfEnabled = <T>(feature: FeatureKey, fn: () => T) => {
        if (!isEnabled(feature)) {
            return;
        }
        return fn();
    };

    /**
     * Executes the given function if the feature is enabled, otherwise throws an error.
     */
    const runIfEnabledOrFail = <T>(feature: FeatureKey, fn: () => T) => {
        if (!isEnabled(feature)) {
            throw new Error(`Feature "${feature}" is not enabled`);
        }
        return fn();
    };

    return {
        isEnabled,
        runIfEnabled,
        runIfEnabledOrFail
    };
}
