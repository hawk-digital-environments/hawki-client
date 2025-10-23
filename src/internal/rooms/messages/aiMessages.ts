import type {Connection} from '../../connection/connection.js';
import type {Room} from '../rooms.js';
import {sendMessageToAi} from './api.js';
import type {RoomMessage} from './messages.js';
import type {RoomKeys} from '../../encryption/keychain/KeychainHandle.js';
import type {ResourceType} from '../../resources/resources.js';

export interface AiMessage {
    role: 'assistant' | 'user' | 'system';
    content: {
        text: string;
    };
}

async function resolveModel(connection: Connection): Promise<ResourceType<'ai_model'>> {
    let model = await connection.client.ai.currentModel().getAsync(2000);
    if (model) {
        return model;
    }

    return await connection.client.ai.defaultModel('text').getAsyncAsserted(
        2000,
        'Failed to send message to AI: Neither a current model nor a default model is available'
    );
}

export async function sendMessageToAiIfNeeded(
    connection: Connection,
    room: Room,
    roomKeys: RoomKeys,
    message: RoomMessage
): Promise<void> {
    // If the AI feature is disabled, we don't need to do anything
    if (!connection.config.featureFlags.aiInGroups) {
        return;
    }

    if (!doesMessageMentionAi(connection, message.content)) {
        return;
    }

    connection.log.info('Message mentions AI, preparing to send to AI...');

    const model = await resolveModel(connection);

    if (message.ai) {
        return refreshAiMessage(connection, room, roomKeys, message);
    }

    await sendMessageToAi(
        connection,
        room,
        roomKeys,
        model,
        message,
        await findContextMessages(connection, room, message)
    );

    connection.log.info('Message sent to AI, waiting for response...');
}

export async function refreshAiMessage(
    connection: Connection,
    room: Room,
    roomKeys: RoomKeys,
    message: RoomMessage
) {
    const aiModelId = message.ai?.model;
    if (!aiModelId) {
        throw new Error(`AI model ID is missing in message ${message.id}`);
    }

    connection.log.info(`Message ${message.id} is an AI message, refreshing...`);

    const model = await resolveModel(connection);

    await sendMessageToAi(
        connection,
        room,
        roomKeys,
        model,
        message,
        await findContextMessages(connection, room, message)
    );
}

function doesMessageMentionAi(connection: Connection, messageContent: string): boolean {
    const aiKeyword = `@${connection.config.ai.handle.replace('@', '')}`;
    return messageContent.includes(aiKeyword);
}

async function findContextMessages(
    connection: Connection,
    room: Room,
    message: RoomMessage
) {
    const {client: {rooms: {messages: roomMessages}}} = connection;
    const messages = await roomMessages.list(room, {
        limit: 100,
        offsetMessage: message
    }).getAsyncAsserted();

    // If the message is part of a thread, we need to include the parent message
    if (message.threadId !== null) {
        const threadParentMessage = await roomMessages.one(room, message.threadId).getAsync();
        if (threadParentMessage) {
            messages.unshift(threadParentMessage);
        }
    }


    // If the message is an AI message, we need to remove it from the context
    if (message.ai) {
        const aiMessageIndex = messages.findIndex(m => m.id === message.id);
        if (aiMessageIndex !== -1) {
            messages.splice(aiMessageIndex, 1);
        }
    }

    const aiMessages = messages.map(convertMessageToAiMessage);
    aiMessages.unshift(createSystemPromptMessage(room.systemPrompt || 'You are a helpful assistant.'));
    return aiMessages;
}

function convertMessageToAiMessage(message: RoomMessage): AiMessage {
    return {
        role: message.ai ? 'assistant' : 'user',
        content: {
            text: removeAllMentionsFromMessage(message.content)
        }
    };
}

function createSystemPromptMessage(prompt: string): AiMessage {
    return {
        role: 'system',
        content: {
            text: prompt
        }
    };
}

function removeAllMentionsFromMessage(messageContent: string): string {
    const genericMentionRegex = /@\w+/g;
    return messageContent.replace(genericMentionRegex, '').trim();
}
