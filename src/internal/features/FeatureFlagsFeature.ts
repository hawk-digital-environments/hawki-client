import {defineFeature} from './features.js';

export const FeatureFlagsFeature = defineFeature(({featureFlags}) => {
    return {...featureFlags};
});
