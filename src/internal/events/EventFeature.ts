import {defineFeature} from '../features/features.js';

export const EventFeature = defineFeature((connection) => {
    const {
        HIGHEST_PRIORITY,
        LOWEST_PRIORITY,
        onDisconnect,
        onAnyStorageChange,
        onAnyStorageChangeDebounced,
        onStorageChange
    } = connection.eventBus;

    return {
        HIGHEST_PRIORITY,
        LOWEST_PRIORITY,
        onDisconnect: onDisconnect.bind(connection.eventBus),
        onAnyStorageChange: onAnyStorageChange.bind(connection.eventBus),
        onAnyStorageChangeDebounced: onAnyStorageChangeDebounced.bind(connection.eventBus),
        onStorageChange: onStorageChange.bind(connection.eventBus)
    };
});
