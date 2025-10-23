import type {Connection} from '../../connection/connection.js';
import type {RoomMessage} from './messages.js';
import type {Room} from '../rooms.js';
import {encryptSymmetric} from '../../encryption/symmetric.js';
import {exportCryptoKeyToString} from '../../encryption/utils.js';
import type {AiMessage} from './aiMessages.js';
import type {RoomKeys} from '../../encryption/keychain/KeychainHandle.js';
import type {UploadedAttachment} from './attachments.js';
import type {ResourceType} from '../../resources/resources.js';

export async function sendMessage(
    connection: Connection,
    room: Room,
    roomKeys: RoomKeys,
    content: string,
    parentMessage?: RoomMessage | null,
    attachments?: UploadedAttachment[] | null
): Promise<number> {
    const encryptedContent = await encryptSymmetric(content, roomKeys.roomKey);
    const payload = {
        content: {
            text: encryptedContent.toObject(),
            attachments: attachments || []
        },
        thread_id: parentMessage ? parentMessage.id : 0,
        version: 'v2'
    };

    const response = await connection.transfer.requestJsonWith('roomMessagesSend', payload, {
        pathArgs: {slug: room.slug}
    });

    return response.messageData.id;
}

export async function sendMessageToAi(
    connection: Connection,
    room: Room,
    roomKeys: RoomKeys,
    model: ResourceType<'ai_model'>,
    message: RoomMessage,
    log: AiMessage[]
): Promise<void> {
    if (!connection.config.featureFlags.aiInGroups) {
        throw new Error('AI in groups feature is disabled');
    }

    const payload = {
        broadcast: true,
        thread_id: message.threadId ?? 0,
        slug: room.slug,
        isUpdate: false,
        id: message.id,
        version: 'v2',
        key: await exportCryptoKeyToString(roomKeys.aiKey),
        payload: {
            model: model.model_id,
            stream: false,
            messages: log
        }
    };

    // If the message was sent by AI we can assume that the AI should refresh the content.
    if (message.isAi) {
        payload.isUpdate = true;
    }

    return connection.transfer.requestJsonWith('roomMessagesAiSend', payload, {
        pathArgs: {slug: room.slug}
    }).then(() => void 0);
}

export async function editMessage(
    connection: Connection,
    room: Room,
    roomKeys: RoomKeys,
    message: RoomMessage,
    content: string
): Promise<void> {
    const encryptedContent = await encryptSymmetric(content, roomKeys.roomKey);
    const payload = {
        id: message.id,
        content: {
            text: encryptedContent.toObject()
        },
        version: 'v2'
    };

    await connection.transfer.requestJsonWith('roomMessagesEdit', payload, {
        pathArgs: {slug: room.slug}
    });
}

export async function markMessageAsRead(
    connection: Connection,
    room: Room,
    message: RoomMessage
): Promise<void> {
    return connection.transfer.requestJsonWith('roomMessagesMarkRead', {
        id: message.id,
        version: 'v2'
    }, {
        pathArgs: {slug: room.slug}
    });
}
