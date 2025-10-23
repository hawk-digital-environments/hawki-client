import type {RoomMessage} from './messages.js';
import type {Room} from '../rooms.js';
import {uploadAttachmentsIfNeeded} from './attachments.js';
import {sendMessageToAiIfNeeded} from './aiMessages.js';
import type {RoomKeys} from '../../encryption/keychain/KeychainHandle.js';
import {sendMessage as doSendMessage} from './api.js';
import type {Connection} from '../../connection/connection.js';
import type {ReactiveStoreFront} from '../../resources/stores/ReactiveStoreFront.js';

export interface SendMessageOptions {
    parentMessage?: RoomMessage | number,
    attachments?: File | File[] | FileList
}

export async function sendMessage(
    connection: Connection,
    roomKeys: RoomKeys,
    room: Room,
    one: (room: Room, id: number) => ReactiveStoreFront<RoomMessage | null | undefined>,
    content: string,
    options?: SendMessageOptions
) {

    let parentMessage = options?.parentMessage;
    if (typeof parentMessage === 'number') {
        parentMessage = await one(room, parentMessage).getAsync() || undefined;
    }

    const attachments = await uploadAttachmentsIfNeeded(connection, room, options?.attachments);

    const messageId = await doSendMessage(
        connection,
        room,
        roomKeys,
        content,
        parentMessage as RoomMessage | undefined,
        attachments
    );

    const messageStore = one(room, messageId);

    const cleanupOnce = messageStore.subscribe(async message => {
        if (!message || message.id !== messageId) {
            return;
        }

        cleanupOnce();

        await sendMessageToAiIfNeeded(
            connection,
            room,
            roomKeys,
            message
        );
    });

    return messageStore;
}
