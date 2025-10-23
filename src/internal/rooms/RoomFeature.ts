import type {CreateRoomArgs, Room, UpdateRoomArgs} from './rooms.js';
import {createRoomTypingHandle} from './typing/RoomTypingHandle.js';
import {createRoomMessagesHandle} from './messages/RoomMessagesHandle.js';
import {createRoomMembersHandle} from './members/RoomMembersHandle.js';
import {createRoom, leaveRoom, removeRoom, updateRoom} from './api.js';
import {incomingInvitationHandling} from './incomingInvitationHandling.js';
import {defineFeature} from '../features/features.js';
import {validateAvatarLimits} from '../files/utils.js';
import {isNonEmptyString} from '../guards.js';
import type {ResourceStoredType, ResourceType} from '../resources/resources.js';
import type {RoomKeys} from '../encryption/keychain/KeychainHandle.js';
import {decryptSymmetric, loadSymmetricCryptoValue} from '../encryption/symmetric.js';
import {filterUndefinedAndNullAsync, limitAndOffset, limitAndOffsetKey} from '../resources/stores/utils.js';


export interface RoomListConstraints {
    limit?: number;
    offset?: number;
}

export const RoomFeature = defineFeature((connection) => {
    const records = connection.resourceDb.getTable('room');

    const typingHandle = createRoomTypingHandle(connection);
    const membersHandle = createRoomMembersHandle(connection);
    const messagesHandle = createRoomMessagesHandle(connection, membersHandle);

    const {eventBus, log, userinfo: {id: currentUserId}} = connection;

    incomingInvitationHandling(connection);

    eventBus.onStorageChange('member', 'remove', async (member) => {
        if (member?.user_id === currentUserId) {
            log.info(`The current user was removed from room (${member.room_id}), removing the room from storage...`);
            await eventBus.dispatchClearSyncedDataForRoom(member.room_id);
        }
    });

    eventBus.onClearSyncedDataForRoom((roomId) => {
        return records.remove(table => table.where('id').equals(roomId));
    });

    const convertResourceToModel = async (
        resource: ResourceStoredType<'room'>,
        roomKeys: Map<string, RoomKeys>,
        lastMessageAts: Map<number, Date>
    ): Promise<Room | null> => {
        log.debug(`Converting room resource to model:`, resource.id);
        const roomKey = roomKeys.get(resource.slug);
        if (!roomKey) {
            log.warning(`Missing room keys for room ${resource.slug} (${resource.id}), cannot decrypt data`);
            return null;
        }

        try {
            return {
                id: resource.id,
                slug: resource.slug,
                name: resource.name,
                description: resource.room_description ? await decryptSymmetric(loadSymmetricCryptoValue(resource.room_description), roomKey.roomKey) : null,
                systemPrompt: resource.system_prompt ? await decryptSymmetric(loadSymmetricCryptoValue(resource.system_prompt), roomKey.roomKey) : null,
                avatar: resource.avatar,
                createdAt: resource.created_at,
                updatedAt: resource.updated_at,
                lastMessageAt: lastMessageAts.get(resource.id) || null
            };
        } catch (e) {
            connection.log.error(`Failed to decrypt room ${resource.slug} data: ${(e as Error).message}`);
            return null;
        }
    };

    const listConstraintsToString = (constraints?: RoomListConstraints) => {
        let key = 'all';
        if (constraints?.limit) {
            key += `-limit:${constraints.limit}`;
        }
        if (constraints?.offset) {
            key += `-offset:${constraints.offset}`;
        }
        return key;
    };

    const validateUserIsRoomAdmin = (room: Room) =>
        membersHandle.meIs(room, 'admin').getAsync();

    /**
     * Returns a specific room by its ID or slug.
     * @param identifier The room's ID (number) or slug (string).
     */
    const one = (identifier: string | number | ResourceType<'room'>) => {
        if (typeof identifier === 'object') {
            identifier = identifier.id;
        }
        return records.one
            .get(
                typeof identifier === 'number' ? identifier.toString() : identifier,
                (table) => typeof identifier === 'number'
                    ? table.get(identifier)
                    : table.where('slug').equals(identifier).first()
            )
            .derive(
                'model',
                (resource, roomKeys, lastMessageAts) =>
                    resource ? convertResourceToModel(resource, roomKeys, lastMessageAts) : null,
                [connection.keychain.roomKeys(), messagesHandle.lastMessageAtMap()]
            );
    };

    /**
     * Returns a reactive list of rooms.
     * The list is sorted by last message date, or creation date if there are no messages.
     * @note This list contains ONLY SYNCED rooms; e.g. rooms that the current user is a member of.
     * @param constraints
     */
    const list = (constraints?: RoomListConstraints) =>
        records.list.get(
            listConstraintsToString(constraints),
            (table) => table.toArray()
        ).derive(
            'models',
            (resources, roomKeys, lastMessageAts) =>
                filterUndefinedAndNullAsync(
                    resources.map(res => convertResourceToModel(res, roomKeys, lastMessageAts))
                ).then(rooms => {
                        return rooms.sort((a, b) => {
                            const dateA = a.lastMessageAt ? a.lastMessageAt.getTime() : a.createdAt.getTime();
                            const dateB = b.lastMessageAt ? b.lastMessageAt.getTime() : b.createdAt.getTime();
                            return dateB - dateA;
                        });
                    }
                ),
            [connection.keychain.roomKeys(), messagesHandle.lastMessageAtMap()]
        ).derive(
            `limited${limitAndOffsetKey(constraints)}`,
            rooms => limitAndOffset(rooms, constraints)
        );

    /**
     * Remove a room.
     * This will remove the room for ALL members, so only use this if you are sure.
     * You must be a room admin to perform this action.
     * @param room
     */
    const remove = async (room: Room) => {
        await validateUserIsRoomAdmin(room);
        await removeRoom(connection, room);
        await connection.keychain.removeRoomKeys(room.slug);
        await eventBus.dispatchClearSyncedDataForRoom(room.id);
    };

    /**
     * Leave a room.
     * This will remove the current user from the room.
     * You can always re-join the room later if you have the invitation link.
     * @param room
     */
    const leave = async (room: Room) => {
        await leaveRoom(connection, room);
        await connection.keychain.removeRoomKeys(room.slug);
        await eventBus.dispatchClearSyncedDataForRoom(room.id);
    };

    /**
     * Create a new room.
     * The current user will automatically become a room admin.
     * @param args
     */
    const create = async (args: CreateRoomArgs): Promise<Room> => {
        if (!isNonEmptyString(args.name)) {
            throw new Error('Room name is required');
        }

        const [{id, slug}] = await Promise.all([
            (() => createRoom(connection, args.name))(),
            (async () => {
                if (!isNonEmptyString(args.systemPrompt)) {
                    args.systemPrompt = await connection.client.ai.systemPrompt('default').getAsyncAsserted(500);
                }
            })()
        ]);

        const roomKeys = await connection.keychain.createRoomKeys(slug);
        if (!roomKeys) {
            throw new Error('Failed to create room keys');
        }

        await updateRoom(connection, slug, {...args, name: ''}, roomKeys); // name is already set during creation

        return one(id).getAsyncAsserted();
    };

    /**
     * Update a room's details.
     * You must be a room admin to perform this action.
     * @param room
     * @param changes
     */
    const update = async (room: Room, changes: UpdateRoomArgs) => {
        await validateUserIsRoomAdmin(room);
        await updateRoom(
            connection,
            room.slug,
            changes,
            await connection.keychain.roomKeysOf(room).getAsyncAsserted(500)
        );
    };

    /**
     * Set or update a room's avatar.
     * You must be a room admin to perform this action.
     * @param room
     * @param avatar
     */
    const setAvatar = (room: Room, avatar: File) => {
        return connection.transfer.upload(
            'roomAvatarUpload',
            avatar,
            {
                fieldName: 'image',
                pathArgs: {slug: room.slug},
                beforeWorkerStarts: async () => {
                    await validateUserIsRoomAdmin(room);
                    validateAvatarLimits(connection, avatar);
                }
            });
    };

    return {
        create,
        update,
        list,
        one,
        remove,
        setAvatar,
        leave,
        get typing() {
            return typingHandle;
        },
        get messages() {
            return messagesHandle;
        },
        get members() {
            return membersHandle;
        }
    };
});
