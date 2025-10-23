import type {HawkiClient} from '../../HawkiClient.js';
import type {Logger} from '../logger.js';
import type {EventListenerList} from './EventListenerList.js';
import {createEventHandlerProxy, type EventHandlerProxy} from './EventHandlerProxy.js';
import type {WebsocketEventMeta} from './websockets.js';
import type {ResourceName, ResourceStoredType, ResourceType} from '../resources/resources.js';
import type {SyncLog, SyncLogEntry} from '../resources/sync/sync.js';

export type EventListener<T = any> = (message: T) => void | Promise<void>;

type EventHandlerType = 'default' | 'websocket'

export type StorageChangeAction = 'set' | 'remove';

export interface StorageChangeSet<TResourceName extends ResourceName = ResourceName> {
    resourceName: TResourceName;
    action: StorageChangeAction;
    record: ResourceStoredType<TResourceName>;
}

/**
 * Describes a custom event handler, that can be bound to the event bus.
 * Custom event handlers allow features to integrate their own event systems into the global event bus.
 * For example, the websocket event handler integrates the Laravel Echo event system,
 * allowing features to listen for events directly from the websocket connection.
 */
export interface EventHandler<T = any, META = any> {
    /**
     * Executed if an event should be dispatched. The handler MAY choose to notify the listeners in the list,
     * send it to an external system, or ignore it completely.
     * @param list
     * @param message
     * @param eventType
     * @param meta
     */
    dispatch(list: EventListenerList<T>, message: T, eventType: string, meta: META): Promise<void>;

    addListener(list: EventListenerList<T>, listener: EventListener<T>, priority: number, eventType: string, meta: META): () => void;
}

export type EventBus = ReturnType<typeof createEventBus> & {
    onSyncEvent<T extends ResourceName>(
        resourceType: T,
        action: 'set',
        listener: (resource: ResourceType<T>) => void | Promise<void>,
        priority?: number
    ): () => void;
    onSyncEvent<T extends ResourceName>(
        resourceType: T,
        action: 'remove:resource',
        listener: (resource: ResourceType<T>) => void | Promise<void>,
        priority?: number
    ): () => void;
    onSyncEvent<T extends ResourceName>(
        resourceType: T,
        action: 'remove',
        listener: (resourceId: number) => void | Promise<void>,
        priority?: number
    ): () => void;
}

// Priority: Higher number means higher priority (executed first), lower number means lower priority (executed later).
// Default priority is 0, negative priority means executed later, positive priority means executed earlier.
export function createEventBus(log: Logger) {
    log = log.withPrefix('EventBus');

    const handlerProxies = new Map<EventHandlerType, EventHandlerProxy>();
    const getProxy = <T = any, META = undefined>(type: EventHandlerType): EventHandlerProxy<T, META> => {
        if (!handlerProxies.has(type)) {
            handlerProxies.set(type, createEventHandlerProxy<T, META>(log.withPrefix(`Proxy(${type})`)));
        }
        return handlerProxies.get(type)!;
    };

    const getDefaultProxy = () => getProxy('default');
    const getWebsocketProxy = () => getProxy<any, WebsocketEventMeta>('websocket');

    getDefaultProxy().bind(createGenericEventHandler());

    /**
     * A priority value that is higher than any other priority. Listeners with this priority will be executed first.
     */
    const HIGHEST_PRIORITY = Number.POSITIVE_INFINITY;
    /**
     * A priority value that is lower than any other priority. Listeners with this priority will be executed last.
     */
    const LOWEST_PRIORITY = Number.NEGATIVE_INFINITY;

    /**
     * Listener for when the client is fully initialized and ready to use.
     * Dispatches before the promise returned by `createHawkiClient()` resolves.
     * @param listener The listener to call.
     * @param priority The priority of the listener. Higher priority listeners are called first. Default is 0.
     * @returns A function to remove the listener.
     */
    const onInit = (listener: EventListener<HawkiClient>, priority?: number) =>
        getDefaultProxy().addListener({listener, priority, eventType: 'init'});

    /**
     * Dispatches the init event. Called by `createHawkiClient()` after initialization is complete.
     * @param client The initialized HawkiClient instance.
     * @returns A promise that resolves when all listeners have been called.
     */
    const dispatchInit = (client: HawkiClient) =>
        getDefaultProxy().dispatch(client, 'init');

    /**
     * Listener for when a full resync is required.
     * Allows the application to clear any cached synced data, before starting a fresh sync.
     * @param listener The listener to call.
     * @param priority The priority of the listener. Higher priority listeners are called first. Default is 0.
     * @returns A function to remove the listener.
     */
    const onClearSyncedData = (listener: EventListener<void>, priority?: number): () => void =>
        getDefaultProxy().addListener({listener, priority, eventType: 'sync:clear'});

    /**
     * Dispatches the clear synced data event. Called when a full resync is required.
     * Allows the application to clear any cached synced data, before starting a fresh sync.
     * @returns A promise that resolves when all listeners have been called.
     */
    const dispatchClearSyncedData = (): Promise<void> =>
        getDefaultProxy().dispatch(undefined, 'sync:clear');

    /**
     * Listener for when synced data for a specific room should be cleared.
     * This allows the application to clear any cached synced data for a specific room,
     * before starting a fresh sync for that room. Will also be called, when the user leaves a room.
     *
     * IMPORTANT: If a full resync is required, the `onClearSyncedData` event will be dispatched instead.
     * @param listener The listener to call with the room ID.
     * @param priority The priority of the listener. Higher priority listeners are called first. Default is 0.
     * @returns A function to remove the listener.
     */
    const onClearSyncedDataForRoom = (listener: EventListener<number>, priority?: number): () => void =>
        getDefaultProxy().addListener({listener, priority, eventType: 'sync:clear:room'});

    /**
     * Dispatches the clear synced data for room event. Called when the user leaves a room
     * or when synced data for a specific room should be cleared.
     * This allows the application to clear any cached synced data for a specific room,
     * before starting a fresh sync for that room.
     *
     * IMPORTANT: If a full resync is required, the `dispatchClearSyncedData` event should be called instead.
     * @param roomId The ID of the room to clear synced data for.
     * @returns A promise that resolves when all listeners have been called.
     */
    const dispatchClearSyncedDataForRoom = (roomId: number): Promise<void> =>
        getDefaultProxy().dispatch(roomId, 'sync:clear:room');

    /**
     * Adds a listener to be called when a fetch response had sync log entries injected into it.
     * This allows the application to process the sync log entries immediately,
     * instead of waiting for the websocket sync events to arrive.
     * This is useful to reduce the time between sending the request and having the data available.
     *
     * Note, the sync log entries are still processed via the websocket events as well,
     * the application will try to deduplicate any work done in the response listener.
     * @param listener The listener to call with the sync log.
     * @param priority The priority of the listener. Higher priority listeners are called first. Default is 0.
     * @returns A function to remove the listener.
     */
    const onSyncLogInResponseEvent = (listener: EventListener<SyncLog>, priority?: number) =>
        getDefaultProxy().addListener({listener, priority, eventType: 'sync:log:response'});

    /**
     * Dispatches a sync log that was received as part of a fetch response.
     * This allows the application to process the sync log entries immediately,
     * instead of waiting for the websocket sync events to arrive.
     *
     * @param syncLog The sync log to process.
     * @returns A promise that resolves when all listeners have been called.
     */
    const dispatchSyncLogInResponseEvent = (syncLog: SyncLog) =>
        getDefaultProxy().dispatch(syncLog, 'sync:log:response');

    /**
     * Adds a listener to be executed for every entry in the sync log. The listener will be called
     * with the resource that was changed, or the ID of the resource that was removed.
     * This is a low-level event that allows the application to react to changes in the data
     * as soon as possible. The listener will be called for every sync log entry, so it should
     * be efficient and not perform any heavy operations.
     *
     * @param resourceName The name of the resource to listen for.
     * @param action The action to listen for. Can be 'set' (create or update), 'remove' (delete by ID), or 'remove:resource' (delete but with full resource data).
     * @param listener The listener to call with the resource or resource ID.
     * @param priority The priority of the listener. Higher priority listeners are called first. Default is 0.
     * @returns A function to remove the listener.
     */
    const onSyncEvent = <T extends ResourceName>(
        resourceName: T,
        action: SyncLogEntry['action'] | 'remove:resource',
        listener: EventListener<ResourceType<T>> | EventListener<number>,
        priority?: number
    ): () => void =>
        getDefaultProxy().addListener({
            eventType: `sync:${resourceName}:${action}`,
            listener,
            priority
        });

    /**
     * Dispatches a sync event for a specific resource and action.
     * This will call all listeners that were registered for the specific resource and action.
     * The resource can be either the full resource object (for 'set' and 'remove:resource' actions)
     * or just the resource ID (for 'remove' action).
     * @param resourceName The name of the resource that was changed.
     * @param action The action that was performed. Can be 'set' (create or update), 'remove' (delete by ID), or 'remove:resource' (delete but with full resource data).
     * @param resource The resource that was changed, or the ID of the resource that was removed.
     * @returns A promise that resolves when all listeners have been called.
     */
    const dispatchSyncEvent = (
        resourceName: ResourceName,
        action: SyncLogEntry['action'] | 'remove:resource',
        resource: any
    ): Promise<void> =>
        getDefaultProxy().dispatch(resource, `sync:${resourceName}:${action}`);

    /**
     * Adds a listener for websocket messages of a specific type that are targeted at the user.
     * This is a wrapper around the Laravel Echo private channel for the user.
     * The listener will be called with the message data when a message of the specified type is received.
     * @template T The type of the message data. Defaults to `any`.
     * @param messageType The type of the websocket message to listen for. (The name of the Laravel event)
     * @param listener The listener to call with the message data.
     * @param priority The priority of the listener. Higher priority listeners are called first. Default is 0.
     * @returns A function to remove the listener.
     */
    const onUserWebsocketMessage = <T = any>(messageType: string, listener: EventListener<T>, priority?: number) =>
        getWebsocketProxy().addListener({
            listener,
            priority,
            eventType: messageType,
            meta: {type: 'user'}
        });

    /**
     * Adds a listener for websocket messages of a specific type that are targeted at all users.
     * This is a wrapper around the Laravel Echo public channel for all users.
     * The listener will be called with the message data when a message of the specified type is received.
     * @template T The type of the message data. Defaults to `any`.
     * @param messageType The type of the websocket message to listen for. (The name of the Laravel event)
     * @param listener The listener to call with the message data.
     * @param priority The priority of the listener. Higher priority listeners are called first. Default is 0.
     * @returns A function to remove the listener.
     */
    const onAllUsersWebsocketMessage = <T = any>(messageType: string, listener: EventListener<T>, priority?: number) =>
        getWebsocketProxy().addListener({
            listener,
            priority,
            eventType: messageType,
            meta: {type: 'all_users'}
        });

    /**
     * Adds a listener for websocket messages of a specific type that are targeted at a specific room.
     * This is a wrapper around the Laravel Echo private channel for the room.
     * The listener will be called with the message data when a message of the specified type is received.
     * @template T The type of the message data. Defaults to `any`.
     * @param roomSlug The slug of the room to listen for messages in.
     * @param messageType The type of the websocket message to listen for. (The name of the Laravel event)
     * @param listener The listener to call with the message data.
     * @param priority The priority of the listener. Higher priority listeners are called first. Default is 0.
     * @returns A function to remove the listener.
     */
    const onRoomWebsocketMessage = <T = any>(roomSlug: string, messageType: string, listener: EventListener<T>, priority?: number) =>
        getWebsocketProxy().addListener({
            listener,
            priority,
            eventType: messageType,
            meta: {type: 'room', roomSlug}
        });

    /**
     * Adds a listener for websocket whisper messages of a specific type that are targeted at a specific room.
     * The whisper messages are sent via the Laravel Echo whisper method, and are broadcast to all online users in the room.
     * The listener will be called with the message data when a whisper message of the specified type is received.
     *
     * Note: This will catch messages sent by the user themselves as well, if they are in the room.
     * If you want to ignore messages sent by the user themselves, you will need to handle that in the listener.
     *
     * @template T The type of the message data. Defaults to `any`.
     * @param roomSlug The slug of the room to listen for whisper messages in. This scopes the listener to the specific room.
     * @param messageType The type of the websocket whisper message to listen for. (The name set when dispatching the event)
     * @param listener The listener to call with the message data.
     * @param priority The priority of the listener. Higher priority listeners are called first. Default is 0.
     * @returns A function to remove the listener.
     */
    const onRoomWhisperMessage = <T = any>(roomSlug: string, messageType: string, listener: EventListener<T>, priority?: number) =>
        getWebsocketProxy().addListener({
            listener,
            priority,
            eventType: messageType,
            meta: {type: 'room', roomSlug, isWhisper: true}
        });

    /**
     * Dispatches a whisper message to all online users in a specific room via the websocket connection.
     * This is a wrapper around the Laravel Echo whisper method, and will send the message to all users
     * that are currently online and in the specified room.
     *
     * Note: The message will also be received by the user themselves, if they are in the room.
     * If you want to ignore messages sent by the user themselves, you will need to handle that in the listener.
     *
     * @template T The type of the message data. Defaults to `any`.
     * @param roomSlug The slug of the room to send the whisper message to.
     * @param messageType The type of the websocket whisper message to send. Custom name to identify the message type when listening.
     * @param message The message data to send. This can be any serializable object.
     * @returns A promise that resolves when the message has been dispatched.
     */
    const dispatchRoomWhisperMessage = <T = any>(roomSlug: string, messageType: string, message: T) =>
        getWebsocketProxy().dispatch(message, messageType, {type: 'room', roomSlug, isWhisper: true});

    /**
     * Adds a listener that is called when the client is disconnected from the server.
     * This happens when the "disconnect" method is called on the client.
     * The listener is called with an object that indicates whether the local data should be cleared.
     * If the "clear" property is true, the application should clear all local data and state,
     * as the user is effectively logged out and will need to resync when they log back in.
     * @param listener The listener to call when the client is disconnected.
     * @param priority The priority of the listener. Higher priority listeners are called first. Default is 0.
     * @returns A function to remove the listener.
     */
    const onDisconnect = (listener: EventListener<{ clear: boolean }>, priority?: number): () => void =>
        getDefaultProxy().addListener({listener, priority, eventType: 'disconnect'});

    /**
     * Dispatches the disconnect event to all listeners.
     * This is called when the "disconnect" method is called on the client.
     * The "clear" parameter indicates whether the local data should be cleared.
     * @param clear
     */
    const dispatchDisconnect = (clear?: boolean): Promise<void> =>
        getDefaultProxy().dispatch({clear: clear || false}, 'disconnect');

    const addStorageChangeListener = (listener: EventListener<StorageChangeSet>, priority?: number) =>
        getDefaultProxy().addListener({eventType: `storage:change`, listener, priority});

    /**
     * Adds a listener for changes to stored resources in the indexed DB.
     * The listener will be called whenever a resource of the specified type is added, updated, or removed.
     * You can specify the type of action to listen for: 'set' (add or update), 'remove' (delete by ID), or 'all' (any change).
     *
     * The listener is called on any resource change, including changes made by other clients or browser tabs.
     * This allows you to keep your application state in sync with the stored data in real-time.
     *
     * @param resourceName The name of the resource to listen for changes on.
     * @param action The type of action to listen for: 'set', 'remove', or 'all'.
     * @param listener The listener to call with the changed resource. This listener will always receive the full resource data, even for 'remove' actions.
     * @param priority The priority of the listener. Higher priority listeners are called first. Default is 0.
     * @returns A function to remove the listener.
     */
    const onStorageChange = <TResourceName extends ResourceName>(
        resourceName: TResourceName,
        action: 'set' | 'remove' | 'all',
        listener: EventListener<ResourceStoredType<TResourceName>>,
        priority?: number
    ): () => void =>
        addStorageChangeListener(({resourceName: rn, action: a, record}) => {
            if (rn === resourceName && (action === 'all' || a === action)) {
                return listener(record as any as ResourceStoredType<TResourceName>);
            }
        }, priority);

    /**
     * Similar to `onStorageChange`, but listens for changes on any resource type.
     * Instead of providing the listener with a single resource, it provides a `StorageChangeSet` object,
     * which includes the resource name, action type, and the changed resource.
     * This allows the listener to handle changes across all resource types in a unified way.
     *
     * @param listener The listener to call with the storage change set.
     * @param priority The priority of the listener. Higher priority listeners are called first. Default is 0.
     * @returns A function to remove the listener.
     */
    const onAnyStorageChange = (listener: EventListener<StorageChangeSet>, priority?: number): () => void =>
        addStorageChangeListener(listener, priority);

    /**
     * The same as `onAnyStorageChange`, but the listener is debounced.
     * This means that if multiple storage changes occur in quick succession,
     * the listener will only be called once, after a specified wait time.
     * This is useful to prevent excessive calls to the listener when many changes happen at once.
     * The listener will be called with an array of `StorageChangeSet` objects,
     * allowing it to process all changes that occurred during the wait time in a single call.
     *
     * The default wait time is 100 milliseconds, but you can adjust this by providing a different value.
     * @param listener The listener to call with the storage change sets.
     * @param wait The wait time in milliseconds to debounce the listener. Default is 100ms.
     * @param priority The priority of the listener. Higher priority listeners are called first. Default is 0.
     * @returns A function to remove the listener.
     */
    const onAnyStorageChangeDebounced = (
        listener: EventListener<StorageChangeSet[]>,
        wait = 100,
        priority?: number
    ): () => void => {
        const debounced = createDebouncedEventListener<StorageChangeSet>(listener, wait);
        return debounced.wrapCleanup(addStorageChangeListener(debounced, priority));
    };

    /**
     * Dispatches a storage change event to all listeners.
     * This should be called whenever a resource is added, updated, or removed from the indexed DB.
     * The event includes the resource name, action type, and the changed resource.
     * Listeners can use this information to react to changes in the stored data in real-time.
     * @param resourceName
     * @param action
     * @param record
     */
    const dispatchStorageChange = <TResourceName extends ResourceName>(resourceName: TResourceName, action: 'set' | 'remove', record: ResourceStoredType<TResourceName>): Promise<void> =>
        getDefaultProxy().dispatch({resourceName, action, record}, `storage:change`);

    /**
     * Binds a custom event handler for a specific type of events.
     *
     * Custom handlers allow features to integrate their own event systems into the global event bus.
     * For example, the websocket event handler integrates the Laravel Echo event system,
     * allowing features to listen for events directly from the websocket connection.
     *
     * Once a handler is bound for a specific type, all listeners added for that type will be forwarded to the custom handler.
     * Any events dispatched for that type will also be forwarded to the custom handler.
     * This allows features to fully control how events are handled for their specific type.
     *
     * Note: A handler can only be bound once for each type. Attempting to bind a handler for a type that already has a handler will throw an error.
     *
     * @param type
     * @param handler
     */
    const bindHandler = (type: EventHandlerType, handler: EventHandler): void =>
        getProxy(type).bind(handler);


    const debug = (): void => {
        for (const [type, proxy] of handlerProxies) {
            log.info(`EventBus: Handler type "${type}":`);
            proxy.debug(log);
        }
    };

    return {
        HIGHEST_PRIORITY,
        LOWEST_PRIORITY,
        onInit,
        dispatchInit,
        dispatchClearSyncedData,
        onClearSyncedData,
        dispatchClearSyncedDataForRoom,
        onClearSyncedDataForRoom,
        dispatchSyncLogInResponseEvent,
        onSyncLogInResponseEvent,
        dispatchSyncEvent,
        onSyncEvent,
        onUserWebsocketMessage,
        onAllUsersWebsocketMessage,
        onRoomWebsocketMessage,
        dispatchRoomWhisperMessage,
        onRoomWhisperMessage,
        dispatchDisconnect,
        onDisconnect,
        dispatchStorageChange,
        onAnyStorageChange,
        onAnyStorageChangeDebounced,
        onStorageChange,
        bindHandler,
        debug
    };
}

function createDebouncedEventListener<T>(listener: EventListener<T[]>, wait: number) {
    // noinspection JSMismatchedCollectionQueryUpdate
    let messages: T[] = [];
    let timeout: number = 0;

    const debouncedListener: EventListener<T> & {
        wrapCleanup: (cleanup: () => void) => () => void
    } = async (message: T) => {
        messages.push(message);
        clearTimeout(timeout);

        timeout = setTimeout(async () => {
            const toProcess = messages;
            messages = [];
            timeout = 0;
            await listener(toProcess);
        }, wait) as unknown as number;
    };

    debouncedListener.wrapCleanup = (cleanup: () => void) => {
        return () => {
            clearTimeout(timeout);
            cleanup();
        };
    };

    return debouncedListener;
}

function createGenericEventHandler(): EventHandler {
    return {
        dispatch(list, message, eventType) {
            return list.dispatch(eventType, message);
        },
        addListener(list, handler, priority, eventType) {
            return list.addListener(eventType, handler, priority);
        }
    };
}
