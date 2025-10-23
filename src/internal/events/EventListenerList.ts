import type {EventListener} from './EventBus.js';
import type {Logger} from '../logger.js';


type EventListenerSet = Set<EventListener>;

export function createEventListenerList<T = any>() {
    const listenerLists = new Map<string, SortedListenerList>();
    const getList = (eventType: string) => {
        if (!listenerLists.has(eventType)) {
            listenerLists.set(eventType, createdSortedListenerList());
        }
        return listenerLists.get(eventType)!;
    };

    return {
        /**
         * Adds an event listener for the specified event type.
         * Returns a function to remove the listener.
         * Use this in your EventHandler.addListener() implementation, to collect listeners locally.
         *
         * @param eventType The type of the event to listen for.
         * @param handler The event listener function.
         * @param priority The priority of the listener. Higher priority listeners are called first. Default is 0.
         * @returns A function to remove the listener.
         */
        addListener(eventType: string, handler: EventListener<T>, priority?: number) {
            return getList(eventType).addListener(handler, priority);
        },

        /**
         * Gets all listeners for the specified event type.
         * The returned set will be sorted by priority in order of execution (highest priority first).
         * @param eventType
         */
        getListeners(eventType: string) {
            return getList(eventType).getListeners();
        },

        /**
         * Dispatches an event to all listeners of the specified event type.
         * Listeners are called in order of priority (highest priority first).
         * If a listener is async, it will be awaited before the next listener is called.
         * @param eventType The type of the event to dispatch.
         * @param event The event object to pass to the listeners.
         */
        async dispatch(eventType: string, event: T) {
            for (const listener of getList(eventType).getListeners()) {
                await listener(event);
            }
        },

        /**
         * Logs debug information about the listener list to the provided logger.
         * @param log
         */
        debug(log: Logger) {
            for (const [eventType, list] of listenerLists) {
                log.info(`      EventListenerList: Event Type "${eventType}" has ${list.length} listeners.`);
                list.debug(log);
            }
        }
    };
}

export type EventListenerList<T = any> = ReturnType<typeof createEventListenerList<T>>;

function createdSortedListenerList<T = any>() {
    const prioritizedListeners = new Map<number, EventListenerSet>();
    const sortedListeners: EventListenerSet = new Set();
    let isSorted = true;

    let length = 0;

    const fillSortedListeners = () => {
        if (isSorted) {
            return;
        }
        sortedListeners.clear();
        const priorities = Array.from(prioritizedListeners.keys()).sort((a, b) => b - a);
        for (const priority of priorities) {
            for (const listener of prioritizedListeners.get(priority)!) {
                sortedListeners.add(listener);
            }
        }
        isSorted = true;
    };

    return {
        get length() {
            return length;
        },
        addListener(handler: EventListener<T>, priority?: number) {
            priority = priority || 0;
            isSorted = false;
            length++;

            if (!prioritizedListeners.has(priority)) {
                prioritizedListeners.set(priority, new Set());
            }
            const handlers = prioritizedListeners.get(priority)!;
            handlers.add(handler);

            return () => {
                length--;
                handlers.delete(handler);
                if (handlers.size === 0) {
                    prioritizedListeners.delete(priority);
                }
                isSorted = false;
            };
        },
        getListeners(): EventListenerSet {
            fillSortedListeners();
            return sortedListeners;
        },
        debug(log: Logger) {
            log.info('          SortedListenerList Debug Info:');
            for (const [priority, listeners] of prioritizedListeners) {
                log.info(`              Priority ${priority}: ${listeners.size} listeners`);
                log.info(`              `, listeners);
            }
        }
    };
}

type SortedListenerList<T = any> = ReturnType<typeof createdSortedListenerList<T>>;
