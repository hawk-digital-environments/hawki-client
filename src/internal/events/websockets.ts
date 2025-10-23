import {type Broadcaster} from 'laravel-echo';
import type {Logger} from '../logger.js';
import type {Userinfo} from '../connection/connection.js';
import type {EventBus, EventHandler} from './EventBus.js';
import {createForwardedBindingHelper} from './ForwardedBindingHelper.js';
import type {TransferHandle} from '../connection/transfer/TransferHandle.js';

export type WebsocketChannel = Broadcaster['reverb']['private'];

export interface WebsocketUserEventMeta {
    type: 'user' | 'all_users';
    isWhisper?: boolean;
}

export interface WebsocketRoomEventMeta {
    type: 'room';
    roomSlug: string;
    isWhisper?: boolean;
}

export type WebsocketEventMeta = WebsocketUserEventMeta | WebsocketRoomEventMeta;

type ChannelResolver = (meta: WebsocketEventMeta) => WebsocketChannel;

export function bindWebsocketEvents(
    log: Logger,
    userinfo: Userinfo,
    echo: TransferHandle['echo'],
    eventBus: EventBus
): void {
    const channels = new Map<string, WebsocketChannel>();
    const getOrCreate = (name: string, create: () => WebsocketChannel): WebsocketChannel => {
        let channel = channels.get(name);
        if (!channel) {
            channel = create();
            channels.set(name, channel);
        }
        return channel;
    };
    const getRoomChannel = (roomSlug: string): WebsocketChannel => {
        return getOrCreate(`room.${roomSlug}`, () => echo.private(`Rooms.${roomSlug}`));
    };
    const getUserChannel = (): WebsocketChannel => {
        return getOrCreate(`user`, () => echo.private(`User.${userinfo.id}`));
    };
    const getAllUsersChannel = (): WebsocketChannel => {
        return getOrCreate(`all_users`, () => echo.private(`AllUsers`));
    };
    const getChannel: ChannelResolver = (meta: WebsocketEventMeta): WebsocketChannel => {
        if (meta.type === 'all_users') {
            return getAllUsersChannel();
        }

        if (meta.type === 'user') {
            return getUserChannel();
        }

        if (meta.type === 'room') {
            return getRoomChannel(meta.roomSlug);
        }

        throw new Error(`Unsupported WebSocket event meta type: ${(meta as any).type}`);
    };

    eventBus.onDisconnect(() => {
        channels.clear();
        echo.disconnect();
    }, eventBus.LOWEST_PRIORITY);

    const defaultHandler = createWebsocketHandler(log, eventBus, getChannel);
    const whisperHandler = createWhisperHandler(log, eventBus, getChannel);
    const getHandler = (meta: WebsocketEventMeta): EventHandler<any, WebsocketEventMeta> => {
        if (meta.isWhisper === true) {
            return whisperHandler;
        }
        return defaultHandler;
    };

    eventBus.bindHandler('websocket', {
        addListener(list, listener, priority, eventType, meta): () => void {
            return getHandler(meta).addListener(list, listener, priority, eventType, meta);
        },
        dispatch(list, message, eventType, meta): Promise<void> {
            return getHandler(meta).dispatch(list, message, eventType, meta);
        }
    } satisfies EventHandler<any, WebsocketEventMeta>);
}

function getEventNameFromMeta(eventType: string, meta: WebsocketEventMeta): string {
    if (meta.type === 'all_users') {
        return `all_users:${eventType}`;
    }
    if (meta.type === 'user') {
        return `user:${eventType}`;
    }
    if (meta.type === 'room') {
        return `room:${meta.roomSlug}:${eventType}`;
    }
    throw new Error(`Unsupported WebSocket event meta type: ${(meta as any).type}`);
}

function createWebsocketHandler(log: Logger, eventBus: EventBus, getChannel: ChannelResolver): EventHandler<any, WebsocketEventMeta> {
    const binding = createForwardedBindingHelper(eventBus);
    return {
        addListener(list, listener, priority, eventType, meta): () => void {
            const fullEventType = getEventNameFromMeta(eventType, meta);
            return binding(
                fullEventType,
                list.addListener(fullEventType, listener, priority),
                function bindWebsocket() {
                    log.info(`Binding WebSocket event listener for event type ${fullEventType}`);
                    const channel = getChannel(meta);
                    const dispatch = (message: any) => {
                        log.info(`Received WebSocket event of type ${fullEventType} on channel: ${channel.name}`, message);
                        list.dispatch(fullEventType, message);
                    };
                    channel.listen(eventType, dispatch);
                    return () => {
                        log.info(`Unbinding WebSocket event listener for event type ${fullEventType}`);
                        channel.stopListening(eventType, dispatch);
                    };
                }
            );
        },
        dispatch(list, message, eventType, meta): Promise<void> {
            return list.dispatch(getEventNameFromMeta(eventType, meta), message);
        }
    };
}

function createWhisperHandler(log: Logger, eventBus: EventBus, getChannel: ChannelResolver): EventHandler {
    const binding = createForwardedBindingHelper(eventBus);

    return {
        addListener(list, listener, priority, eventType, meta): () => void {
            const fullEventType = getEventNameFromMeta(eventType, meta);
            return binding(
                fullEventType,
                list.addListener(fullEventType, listener, priority),
                function bindWebsocket() {
                    log.info(`Binding WebSocket whisper listener for event type ${fullEventType}`);
                    const channel = getChannel(meta);
                    const onMessageEvent = (payload: any) => {
                        log.info(`Received WebSocket whisper of type ${eventType}`, payload);
                        list.dispatch(fullEventType, payload);
                    };
                    channel.listenForWhisper(eventType, onMessageEvent);
                    return () => {
                        log.info(`Unbinding WebSocket whisper listener for event type ${fullEventType}`);
                        channel.stopListeningForWhisper(eventType, onMessageEvent);
                    };
                }
            );
        },
        dispatch(list, message, eventType, meta): Promise<void> {
            log.info(`Dispatching WebSocket whisper for event type ${eventType}`, message, meta);
            const channel = getChannel(meta);
            channel.whisper(eventType, message);
            return list.dispatch(getEventNameFromMeta(eventType, meta), message);
        }
    };
}
