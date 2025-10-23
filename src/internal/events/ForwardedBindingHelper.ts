import type {EventBus} from './EventBus.js';

export type ForwardedBindingHelper<T = any> = (
    /**
     * The event type to bind to.
     * This is basically the key in a map of bindings; but a good practice is to use a string that describes the event type.
     */
    eventType: string,
    /**
     * A function that cleans up the listener that was added to the event bus.
     * This will be called when the last listener for the given event type is removed.
     */
    listenerCleaner: () => void,
    /**
     * A function that is called when the first listener for the given event type is added.
     * It receives the event bus as an argument, and should return a cleanup function that will be called
     * when the last listener for the given event type is removed.
     */
    onUnknownKey: (eventBus: EventBus) => () => void
) => () => void

interface ForwardedBinding {
    cleaner: () => void;
    refCount: number;
}

/**
 * When working with external systems, you might want to only connect to the outside world to "listen" to events
 * when there is at least one listener for that event type. And disconnect from the outside world when there are no
 * more listeners.
 *
 * This helper allows you to create such bindings easily. It keeps track of how many listeners are registered for
 * each event type, and calls the appropriate setup and cleanup functions.
 *
 * Usage example:
 * ```ts
 * const bindingHelper = createForwardedBindingHelper(eventBus);
 *
 * const YourEventHandler implements EventHandler {
 *     addListener(list, listener, priority, eventType: string): {
 *          return bindingHelper(
 *              eventType,
 *              // Register the listener to the event bus and pass its cleanup function
 *              // to the binding helper; which will wrap it and return it as its own cleanup function.
 *              // The usage of the list is not strictly necessary, but it's a good practice to use the same
 *              // listener list as the event bus, to keep things consistent.
 *              list.addListener(listener, priority, eventType),
 *              // This function is called when the first listener for the given event type is added.
 *              // Here you should set up the external binding, and return a cleanup function that will be called
 *              // when the last listener for the given event type is removed.
 *              (eventBus) => {
 *                  // Set up the external binding here, e.g. connect to a WebSocket channel, or start listening to a DOM event.
 *                  const externalListener = connectToYourExternalSystem();
 *                  externalListener.on(eventType, (data) => {
 *                     // Again, it is not strictly necessary to use the "list" here, but it simplifies things.
 *                     // You can also call eventBus.dispatch() directly, but then you need to handle errors and async properly.
 *                     list.dispatch(eventType, data);
 *                  });
 *
 *                  // Return a cleanup function that will be called when the last listener for the given event type is removed.
 *                  return () => {
 *                      externalListener.off(eventType);
 *                      externalListener.disconnect();
 *                  };
 *              }
 *          );
 *     }
 * }
 * ```
 *
 * @param eventBus
 */
export function createForwardedBindingHelper(eventBus: EventBus): ForwardedBindingHelper {
    const bindings = new Map<string, ForwardedBinding>();

    /**
     * Creates a wrapper for binding external event sources to the event bus.
     * When the first listener for a given event type is added, the `onUnknownKey` function is called
     * to set up the external binding. When the last listener for that event type is removed, the cleanup
     * function returned by `onUnknownKey` is called to tear down the external binding.
     *
     * The `listenerCleaner` function is the function to clean up the real listener, which will
     * be wrapped by this function to manage the reference counting.
     *
     * @param eventType The type of the event to bind to.
     * @param listenerCleaner A function that cleans up the listener that was added to the event bus.
     * @param onUnknownKey A function that is called when the first listener for the given event type is added.
     *                     It receives the event bus as an argument, and should return a cleanup function that will be called
     *                     when the last listener for the given event type is removed.
     * @returns A cleanup function that removes the listener and manages the reference counting.
     */
    return (eventType, listenerCleaner, onUnknownKey) => {
        let binding = bindings.get(eventType);
        if (!binding) {
            binding = {
                cleaner: onUnknownKey(eventBus),
                refCount: 0
            };
            bindings.set(eventType, binding);

            eventBus.onDisconnect(() => {
                binding?.cleaner();
                bindings.delete(eventType);
            }, -100);
        }
        binding.refCount++;

        return () => {
            listenerCleaner();
            const binding = bindings.get(eventType);
            if (!binding) {
                return;
            }
            binding.refCount--;
            if (binding.refCount <= 0) {
                binding.cleaner();
                bindings.delete(eventType);
            }
        };
    };

}
