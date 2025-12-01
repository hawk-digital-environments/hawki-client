import type {RoomMessage} from './messages.js';
import type {Connection} from '../../connection/connection.js';
import type {Room} from '../rooms.js';
import {editMessage, markMessageAsRead} from './api.js';
import {refreshAiMessage as doRefreshAiMessage} from './aiMessages.js';
import {decryptSymmetric, loadSymmetricCryptoValue, type SymmetricCryptoValue} from '../../encryption/symmetric.js';
import type {RoomKeys} from '../../encryption/keychain/KeychainHandle.js';
import type {ResourceStoredType} from '../../resources/resources.js';
import type {Member} from '../members/members.js';
import {createRemovedMemberDummy} from '../members/createRemovedMemberDummy.js';
import type {RoomMembersHandle} from '../members/RoomMembersHandle.js';
import {deriveMap, filterUndefinedAndNullAsync} from '../../resources/stores/utils.js';
import type {Table} from 'dexie';
import {sendMessage, type SendMessageOptions} from './send.js';
import type {ReactiveStoreFront} from '@lib/internal/resources/stores/ReactiveStoreFront.js';

export interface MessageListConstraints {
    /**
     * Maximum number of messages to return. If not set, all messages will be returned.
     */
    limit?: number,
    /**
     * Number of messages to skip from the end (most recent). Cannot be used together with `offsetMessageId` or `offsetMessage`.
     */
    offset?: number,
    /**
     * If set, only messages in the specified thread will be returned.
     */
    threadId?: number;
    /**
     * If true, only messages not in a thread will be returned. Cannot be used together with `threadId`.
     */
    notInThread?: true,
    /**
     * Direction to sort the messages. Defaults to 'desc' (most recent first).
     * If 'asc' is used, the `offset` will skip messages from the start (oldest).
     */
    direction?: 'asc' | 'desc',
    /**
     * Message ID to use as an offset. The message with this ID will be excluded from the results.
     * Cannot be used together with `offset` or `offsetMessage`.
     * If set, `threadId` and `notInThread` will be automatically determined based on the message's properties.
     */
    offsetMessageId?: number,
    /**
     * Message to use as an offset. The message with this ID will be excluded from the results.
     * Cannot be used together with `offset` or `offsetMessageId`.
     * If set, `threadId` and `notInThread` will be automatically determined based on the message's properties.
     */
    offsetMessage?: RoomMessage,
}

export type RoomMessagesHandle = ReturnType<typeof createRoomMessagesHandle>;

export function createRoomMessagesHandle(connection: Connection, members: RoomMembersHandle) {
    const {
        resourceDb,
        eventBus,
        keychain
    } = connection;
    const records = resourceDb.getTable('room_message');

    eventBus.onClearSyncedDataForRoom(async (roomId) => {
        return records.remove(
            table => table.where('room_id').equals(roomId)
        );
    });

    const getRoomKeysOrFail = async (room: Room) => {
        const roomKeys = await keychain.roomKeys().getAsyncAsserted();
        if (!roomKeys || !roomKeys.has(room.slug)) {
            throw new Error(`No room keys found for room ${room.slug}`);
        }
        return roomKeys.get(room.slug)!;
    };

    /**
     * Decrypts the content of a message, trying the AI keys if the message is from an AI.
     * @param isAi
     * @param content
     * @param roomKey
     */
    const decryptContent = async (
        isAi: boolean,
        content: SymmetricCryptoValue,
        roomKey: RoomKeys
    ) => {
        if (isAi) {
            try {
                return await decryptSymmetric(content, roomKey.aiKey);
            } catch {
                return await decryptSymmetric(content, roomKey.aiLegacyKey);
            }
        }
        return decryptSymmetric(content, roomKey.roomKey);
    };

    const convertResourceToModel = async (
        resource: ResourceStoredType<'room_message'>,
        room: Room,
        members: Map<number, Member>,
        roomKeys: Map<string, RoomKeys>
    ): Promise<RoomMessage | undefined> => {
        connection.log.debug(`Converting message resource to model:`, resource.id);
        let member = members.get(resource.member_id);

        if (!room) {
            connection.log.error(`Room with ID ${resource.room_id} not found for message ${resource.id}`);
            return undefined;
        }

        if (!member) {
            connection.log.warning(`Member with ID ${resource.member_id} not found for message ${resource.id}`);
            member = createRemovedMemberDummy(resource.member_id, resource.room_id);
        }

        const roomKey = roomKeys.get(room.slug);

        if (!roomKey) {
            connection.log.error(`Room keys for room ${room.slug} not found, cannot decrypt message ${resource.id}`);
            return undefined;
        }

        try {
            return {
                id: resource.id,
                memberId: resource.member_id,
                author: member,
                isAi: resource.is_ai,
                isRead: resource.is_read,
                readBy: resource.read_by,
                isEdited: resource.is_edited,
                hasThread: resource.has_thread,
                isInThread: resource.thread_id !== -1,
                content: await decryptContent(!!resource.model, loadSymmetricCryptoValue(resource.content), roomKey),
                ai: resource.ai,
                threadId: resource.thread_id !== -1 ? resource.thread_id : null,
                createdAt: resource.created_at,
                updatedAt: resource.updated_at,
                attachments: resource.attachments,
                room
            };
        } catch (e) {
            connection.log.error(`Failed to decrypt message ${resource.id} in room ${room.slug}: ${(e as Error).message}`);
            return undefined;
        }
    };

    const constraintsToKey = (room: Room, constraints: MessageListConstraints | undefined) =>
        room.id.toString() + JSON.stringify(
            constraints ? [
                constraints.limit,
                constraints.offset,
                constraints.threadId,
                constraints.notInThread,
                constraints.direction,
                constraints.offsetMessageId,
                constraints.offsetMessage?.id ?? null
            ] : null);

    /**
     * Returns the last message in the room that is not part of a thread.
     * @param room
     */
    const lastMessage = (room: Room) =>
        records.one.get(
            `last-${room.id}`,
            async (table) => table.where({room_id: room.id, thread_id: -1}).last()
        ).derive(
            'model',
            (resource, members, roomKeys) =>
                resource ? convertResourceToModel(resource, room, members, roomKeys) : null,
            [members.map(room), connection.keychain.roomKeys()]
        );

    const lastMessagesRaw = () => records.list.get(
        'lastMessages',
        async (table) => {
            const map = new Map<number, ResourceStoredType<'room_message'>>();

            const collection = table.where('[thread_id+room_id+created_at]');

            await collection
                .between([-1, -Infinity, -Infinity], [-1, Infinity, Infinity])
                .reverse() // Sorts by created_at (desc), then room_id (desc)
                .each(message => {
                    // Because of the reverse sort, the first time we see a room_id,
                    // it's guaranteed to be its latest message.
                    if (!map.has(message.room_id)) {
                        map.set(message.room_id, message);
                    }
                });

            return Array.from(map.values());
        });

    /**
     * Returns a map of room IDs to their last message (not in a thread).
     * This is used to display the last message preview in the room list.
     * Note: This only includes rooms that have at least one message.
     */
    const lastMessageMap = () => lastMessagesRaw()
        .derive(
            'models',
            (resources, members, rooms, roomKeys) =>
                filterUndefinedAndNullAsync(
                    resources.map(resource => convertResourceToModel(resource, rooms.get(resource.room_id)!, members, roomKeys))
                ),
            [members.map(), (connection.client as any).rooms.map() as ReactiveStoreFront<Map<number, Room>>, connection.keychain.roomKeys()]
        )
        .derive('map', (entries: any) => deriveMap(entries, (entry: RoomMessage) => entry.room.id));

    /**
     * Returns a map of room IDs to the date of their last message (not in a thread).
     * This is used to display the "last message at" date in the room list.
     * Note: This only includes rooms that have at least one message.
     */
    const lastMessageAtMap = () => lastMessagesRaw()
        .derive('map', (entries) => {
            const map = new Map<number, Date>();
            for (const message of entries) {
                map.set(message.room_id, new Date(message.created_at));
            }
            return map;
        });

    /**
     * Returns the number of unread messages in the room.
     * @param room
     */
    const countUnread = (room: Room) =>
        records.count.get(
            `unread-${room.id}`,
            (table) => table.where({room_id: room.id, is_read: 0}).count()
        );

    /**
     * Returns the total number of messages in the room.
     * @param room
     */
    const count = (room: Room) =>
        records.count.get(
            room.id.toString(),
            (table) => table.where({room_id: room.id}).count()
        );

    /**
     * Returns a list of messages in the room, optionally filtered by constraints.
     * @param room The room to get messages for.
     * @param constraints Optional constraints to filter the messages.
     */
    const list = (room: Room, constraints?: MessageListConstraints) =>
        records.list.get(
            constraintsToKey(room, constraints),
            (table) => findMessagesByConstraints(table, room, constraints || {})
        ).derive(
            'models',
            (resources, members, roomKeys) =>
                filterUndefinedAndNullAsync(
                    resources.map(resource => convertResourceToModel(resource, room, members, roomKeys))
                ),
            [members.map(room), connection.keychain.roomKeys()]
        );

    /**
     * Returns a specific message by its ID.
     * @param room The room the message belongs to.
     * @param id The ID of the message to retrieve.
     */
    const one = (room: Room, id: number) =>
        records.one.get(
            id.toString(),
            (table) => table.where({room_id: room.id, id}).first()
        ).derive(
            'model',
            (resource, members, roomKeys) =>
                resource ? convertResourceToModel(resource, room, members, roomKeys) : null,
            [members.map(room), connection.keychain.roomKeys()]
        );

    /**
     * Sends a new message to the room.
     * @param room The room to send the message to.
     * @param content The content of the message.
     * @param options Optional options for sending the message.
     */
    const send = async (
        room: Room,
        content: string,
        options?: SendMessageOptions
    ) =>
        sendMessage(
            connection,
            await getRoomKeysOrFail(room),
            room,
            one,
            content,
            options
        );

    /**
     * Refreshes an AI message by re-sending it to the AI service.
     * This can be used if the AI message failed or if you want to get a new response.
     * @param room The room the message belongs to.
     * @param message The AI message to refresh.
     */
    const refreshAiMessage = async (room: Room, message: RoomMessage) =>
        doRefreshAiMessage(
            connection,
            room,
            await getRoomKeysOrFail(room),
            message
        );

    /**
     * Edits an existing message in the room.
     * You can only edit your own messages.
     * @todo We should probably add the "attachments" option here as well.
     * @param room The room the message belongs to.
     * @param message The message to edit.
     * @param content The new content of the message.
     */
    const edit = async (room: Room, message: RoomMessage, content: string) => {
        if (message.author?.userId !== connection.userinfo.id) {
            throw new Error('You can only edit your own messages.');
        }

        return editMessage(
            connection,
            room,
            await getRoomKeysOrFail(room),
            message,
            content
        );
    };

    /**
     * Marks a message as read in the room.
     * This will update the message's "isRead" status and add the current user to the "readBy" list.
     * @todo This should probably be debounced/throttled/batched to avoid excessive updates when reading multiple messages quickly.
     * @param room
     * @param message
     */
    const markAsRead = async (room: Room, message: RoomMessage) =>
        markMessageAsRead(connection, room, message);

    return {
        lastMessage,
        lastMessageMap,
        lastMessageAtMap,
        count,
        countUnread,
        list,
        one,
        send,
        edit,
        refreshAiMessage,
        markAsRead
    };
}

async function findMessagesByConstraints(
    table: Table,
    room: Room,
    constraints: MessageListConstraints
): Promise<ResourceStoredType<'room_message'>[]> {
    const assertKeyIsNotSet = (key: keyof MessageListConstraints, reason: string) => {
        if (constraints[key] !== undefined) {
            throw new Error(`Constraint "${key as string}" cannot be used: ${reason}`);
        }
    };

    // While not possible in typescript, I had a bug where threadId was a string (extracted from the url)
    // Therefore I added this runtime check to convert it to a number if needed
    // noinspection SuspiciousTypeOfGuard
    if (typeof constraints.threadId === 'string') {
        constraints.threadId = parseInt(constraints.threadId, 10);
    }

    if (constraints.offsetMessage) {
        for (const key of ['offset', 'threadId', 'notInThread', 'offsetMessageId'] as const) {
            assertKeyIsNotSet(key, '"offsetMessageId" is provided.');
        }
        constraints.offsetMessageId = constraints.offsetMessage.id;
        constraints.offsetMessage = undefined;
    } else if (constraints.offsetMessageId) {
        for (const key of ['offset', 'threadId', 'notInThread', 'offsetMessage'] as const) {
            assertKeyIsNotSet(key, '"offsetMessageId" is provided.');
        }
    }

    if (constraints.offsetMessageId) {
        const record = await table.get(constraints.offsetMessageId);
        if (!record) {
            throw new Error(`Offset message with ID ${constraints.offsetMessageId} not found.`);
        }
        constraints.threadId = record.thread_id !== null ? record.thread_id : undefined;
        constraints.notInThread = typeof record.thread_id !== 'number' || record.thread_id < 1 || undefined;
    }

    if (typeof constraints.threadId !== 'number' || constraints.threadId < 1) {
        constraints.threadId = undefined;
        constraints.notInThread = true;
    } else if (constraints.threadId === -1) {
        constraints.threadId = undefined;
        constraints.notInThread = undefined;
    }

    let collection = await (async () => {
        if (constraints.notInThread) {
            return table.where({room_id: room.id, thread_id: -1}).sortBy('id');
        }
        if (constraints.threadId) {
            return table.where('thread_id').equals(constraints.threadId)
                .sortBy('id');
        }

        return table.where('room_id').equals(room.id).sortBy('id');
    })();

    if (constraints.direction === 'asc') {
        collection = collection.reverse();
    }

    if (constraints.offsetMessage) {
        const offsetIndex = collection.findIndex(record => record.id === constraints.offsetMessageId);
        constraints.offset = offsetIndex >= 0 ? collection.length - offsetIndex - 1 : undefined;
    }

    if (constraints.offset) {
        if (constraints.limit) {
            const startIndex = Math.max(0, collection.length - constraints.offset - constraints.limit);
            const endIndex = collection.length - constraints.offset;
            collection = collection.slice(startIndex, endIndex);
        } else {
            collection = collection.slice(0, collection.length - constraints.offset);
        }
    } else if (constraints.limit !== undefined) {
        const startIndex = Math.max(0, collection.length - constraints.limit);
        const endIndex = collection.length;
        collection = collection.slice(startIndex, endIndex);
    }

    return collection;
}
