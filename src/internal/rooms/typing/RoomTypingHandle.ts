import type {Connection} from '../../connection/connection.js';
import type {Room} from '../rooms.js';
import {createGenericStore} from '../../resources/stores/GenericStore.js';
import {createStoreFrontProvider} from '../../resources/stores/ReactiveStoreFront.js';

export type RoomTypingHandle = ReturnType<typeof createRoomTypingHandle>;

interface RoomTypingWhisperMessage {
    user: string;
    typing: boolean;
}

const whisperTypingEvent = 'typing';

export function createRoomTypingHandle(
    connection: Connection
) {
    const {userinfo: {username}, eventBus, log} = connection;

    const storeFrontProvider = createStoreFrontProvider<string[], Room>((room) => {
        const store = createGenericStore<string[]>([]);

        if (room !== undefined) {
            const handleTypingChange = ({user: typingUsername, typing: isTyping}: RoomTypingWhisperMessage) => {
                const typing = store.get() ?? [];
                const index = typing.indexOf(typingUsername);
                if (index !== -1) {
                    typing.splice(index, 1);
                }
                if (isTyping) {
                    typing.push(typingUsername);
                }
                store.set(typing);
            };

            eventBus.onRoomWhisperMessage<RoomTypingWhisperMessage>(room.slug, whisperTypingEvent, handleTypingChange);

            eventBus.onSyncEvent('room_ai_writing', 'set', (resource) => {
                if (resource.id !== room.id) {
                    return;
                }
                return handleTypingChange({user: resource.label, typing: true});
            });
            eventBus.onSyncEvent('room_ai_writing', 'remove:resource', (resource) => {
                if (resource.id !== room.id) {
                    return;
                }
                return handleTypingChange({user: resource.label, typing: false});
            });
        } else {
            log.error('Room is undefined in RoomTypingHandle storeFrontProvider, failed to set up typing event listeners.');
        }

        return store;
    });

    /**
     * The current typing state (list of users currently typing in the room)
     * The state is a reactive store that updates in real-time as typing events are received.
     */
    const state = (room: Room) =>
        storeFrontProvider.get(room.id.toString(), room)
            .derive(
                'users',
                (usernames, users) => usernames
                    .map(username => users.get(username))
                    .filter(user => user !== undefined && !user.isMe),
                [connection.client.users.mapByUsername()]);

    /**
     * Propagate the current user as typing in the room.
     * This will notify other users in the room that this user is typing.
     * Call `stop` to indicate that the user has stopped typing.
     */
    const start = (room: Room) => {
        eventBus.dispatchRoomWhisperMessage(room.slug, whisperTypingEvent, {user: username, typing: true});
    };

    /**
     * Propagate the current user as not typing in the room.
     * This will notify other users in the room that this user has stopped typing.
     * Call this after `start` when the user has stopped typing.
     */
    const stop = (room: Room) => {
        eventBus.dispatchRoomWhisperMessage(room.slug, whisperTypingEvent, {user: username, typing: false});
    };

    return {
        state,
        start,
        stop
    };
}
