import type {EventHandler, EventListener} from './EventBus.js';
import {createEventListenerList} from './EventListenerList.js';
import type {Logger} from '../logger.js';

type EventProviderAddListenerArgs<T = any, META = any> = {
    listener: EventListener<T>,
    priority?: number,
    eventType?: string,
    meta?: META
}

/**
 * An EventHandler proxy that allows adding listeners before the actual EventHandler is bound.
 * Once the EventHandler is bound, all queued listeners are added to it.
 * This is useful for cases where you want to register listeners before the actual EventHandler is available,
 * e.g. in modules that are loaded before the main application is initialized.
 *
 * Usage:
 * ```ts
 * const proxy = createEventHandlerProxy(log);
 * proxy.addListener({listener: myListener, eventType: 'myEvent'});
 * ...
 * proxy.bind(actualEventHandler);
 * ...
 * await proxy.dispatch(myEvent, 'myEvent');
 * ```
 *
 * @param log
 */
export function createEventHandlerProxy<T = any, META = any>(log: Logger) {
    let handler: EventHandler | null = null;
    let queuedListeners: EventProviderAddListenerArgs[] = [];
    // This is a total mindfuck: We as we proxy the addListener calls, we need to return a cleanup function that
    // calls the cleanup function returned by the actual addListener call. But we don't have that function until
    // the provider is bound, and we call addListener on it. So in a first pass, we store dummy cleanup functions that do nothing,
    // and once the provider is bound, we replace them with the actual cleanup functions.
    // This way we can return a valid cleanup function immediately, that will work once the provider is bound.
    let forwardedCleanups: (() => void)[] = [];
    const list = createEventListenerList();

    return {
        addListener(args: EventProviderAddListenerArgs<T, META>) {
            if (handler) {
                return handler.addListener(list, args.listener, args.priority || 0, args.eventType || 'default', args.meta);
            } else {
                queuedListeners.push(args);
                forwardedCleanups.push(() => void 0);
                return () => {
                    if (!handler) {

                    }
                    const index = queuedListeners.indexOf(args);
                    const cleanup = forwardedCleanups[index];
                    cleanup();
                    if (index !== -1) {
                        queuedListeners.splice(index, 1);
                        forwardedCleanups.splice(index, 1);
                    }
                };
            }
        },
        async dispatch(message: T, eventType: string, meta?: META) {
            if (!handler) {
                throw new Error('EventHandlerProxy: Cannot dispatch event, provider not bound yet.');
            }
            try {
                await handler.dispatch(list, message, eventType || 'default', meta);
            } catch (e) {
                log.error(`EventHandlerProxy: Error during dispatch of event "${eventType}":`, e, message, meta);
                throw new Error(`EventHandlerProxy: Error during dispatch of event "${eventType}": ${(e as Error).message}`);
            }
        },
        bind(newHandler: EventHandler) {
            if (handler) {
                throw new Error('EventHandlerProxy: Provider already bound.');
            }
            handler = newHandler;

            for (const [index, listener] of queuedListeners.entries()) {
                forwardedCleanups[index] = this.addListener(listener);
            }
            queuedListeners = [];
        },
        debug(log: Logger): void {
            log.info('  EventHandlerProxy Debug Info:');
            log.info(`  - Handler bound: ${handler !== null}`);
            log.info(`  - Queued listeners: ${queuedListeners.length}`);
            log.info(`  - Forwarded cleanups: ${forwardedCleanups.length}`);
            list.debug(log);
        }
    };
}

export type EventHandlerProxy<T = any, META = any> = ReturnType<typeof createEventHandlerProxy<T, META>>;
