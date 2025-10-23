import type {Room} from '../rooms.js';
import type {User} from '../../users/users.js';
import type {Member, UserMemberRole} from './members.js';
import type {Connection} from '../../connection/connection.js';
import type {ResourceStoredType} from '../../resources/resources.js';
import {deriveMap} from '../../resources/stores/utils.js';
import {inviteToRoom} from './inviteToRoom.js';
import {getInviteOptions as getInviteOptionsInternal} from './getInviteOptions.js';
import {removeMember, updateMemberRole} from './api.js';

export type RoomMembersHandle = ReturnType<typeof createRoomMembersHandle>;

export function createRoomMembersHandle(
    connection: Connection
) {
    const records = connection.resourceDb.getTable('member');

    connection.eventBus.onClearSyncedDataForRoom(async (roomId) => {
        return records.remove(table => table.where('room_id').equals(roomId));
    });

    const convertResourceToModel = (resource: ResourceStoredType<'member'>, users: Map<number, User>): Member => {
        const user = users.get(resource.user_id);
        if (!user) {
            throw new Error(`User with ID ${resource.user_id} not found, when converting member ${resource.id} to model`);
        }

        return {
            id: resource.id,
            userId: resource.user_id,
            role: resource.role,
            roomId: resource.room_id,
            createdAt: resource.created_at,
            updatedAt: resource.updated_at,
            user
        };
    };

    /**
     * Returns a list of all members in the room.
     */
    const list = (room: Room) =>
        records.list.get(
            room.id.toString(),
            table => table.where('room_id').equals(room.id).toArray()
        ).derive(
            'models',
            (resources, users) =>
                resources.map(resource => convertResourceToModel(resource, users)),
            [connection.client.users.map()]
        );

    /**
     * Returns the total number of members in the room.
     */
    const count = (room: Room) =>
        records.count.get(
            room.id.toString(),
            table => table.where('room_id').equals(room.id).count()
        );

    /**
     * Returns a specific member by their ID.
     * Important: The ID here refers to the member's unique ID, not the user's ID.
     * To get a member by user ID, use `oneByUserId`.
     * @param id
     */
    const one = (id: number) =>
        records.one.get(id.toString(), id)
            .derive(
                'model',
                (resource, users) => resource ? convertResourceToModel(resource, users) : null,
                [connection.client.users.map()]
            );

    /**
     * Returns a map of all members in the room, keyed by their member ID.
     * @param room
     */
    const map = (room: Room) =>
        list(room)
            .derive('map', models => deriveMap(models, model => model.id));

    /**
     * Returns a map of all members in the room, keyed by their user ID.
     */
    const mapByUserId = (room: Room) =>
        list(room)
            .derive('mapByUserId', models => deriveMap(models, model => model.userId));

    /**
     * Returns a specific member by their associated user ID.
     * If the user is not a member of the room, it returns null.
     */
    const oneByUserId = (room: Room, userId: number) =>
        list(room)
            .derive('byUserId', models => models.find(model => model.userId === userId) || null);

    /**
     * Returns the member object for the current user in the room.
     * If the current user is not a member of the room, it returns null.
     */
    const me = (room: Room) =>
        oneByUserId(room, connection.userinfo.id);

    /**
     * Derives whether the current user has a specific role in the room.
     * If multiple roles are provided, it checks if the user has any of those roles.
     */
    const meIs = (room: Room, role: UserMemberRole | UserMemberRole[]) => {
        role = Array.isArray(role) ? role : [role];
        const key = role.sort().join('|');
        return me(room)
            .derive(
                `is-${key}`,
                member => role.includes((member?.role || 'none') as any)
            );
    };

    const assertMeIsAdmin = async (room: Room) => {
        if (!await meIs(room, 'admin').getAsync(50)) {
            throw new Error('Current user is not an admin in the room');
        }
    };

    /**
     * Returns a list of users that can be invited to the room, based on the search query.
     * The current user must be an admin in the room to use this function.
     * The returned users will have an `invite` method that can be called to invite them to the room.
     * @param room The room to get invite options for.
     * @param query The search query to filter users.
     * @param abort Optional AbortController to cancel the request.
     */
    const getInviteOptions = async (room: Room, query: string, abort?: AbortController) => {
        await assertMeIsAdmin(room);
        return await getInviteOptionsInternal(
            connection,
            room,
            (await list(room).getAsync()) ?? [],
            query,
            (user, role) => inviteToRoom(connection, room, user, role),
            abort
        );
    };

    const resolveRoomMember = async (room: Room, member: Member | number): Promise<Member> => {
        if (typeof member === 'number') {
            const foundMember = await one(member).getAsync(50);
            if (!foundMember) {
                throw new Error('Member not found');
            }
            member = foundMember;
        }

        if (member.roomId !== room.id) {
            throw new Error('Member does not belong to the specified room');
        }

        return member;
    };

    /**
     * Updates the role of a member in the room.
     * The current user must be an admin in the room to use this function.
     * If the member already has the specified role, no action is taken.
     * @param room The room where the member belongs.
     * @param member The member to update, or their ID.
     * @param role The new role to assign to the member.
     */
    const update = async (room: Room, member: Member | number, role: UserMemberRole) => {
        await assertMeIsAdmin(room);

        member = await resolveRoomMember(room, member);

        if (member.role === role) {
            return; // No change needed
        }

        await updateMemberRole(connection, room, member, role);
    };

    /**
     * Removes a member from the room.
     * The current user must be an admin in the room to use this function.
     * A user cannot remove themselves; they must use the "leave" function instead.
     * @param room The room where the member belongs.
     * @param member The member to remove, or their ID.
     */
    const remove = async (room: Room, member: Member | number) => {
        await assertMeIsAdmin(room);

        member = await resolveRoomMember(room, member);

        if (member.user.isMe) {
            throw new Error('You cannot remove yourself from the room; please use the "leave" function instead.');
        }

        await removeMember(connection, room, member);
    };

    return {
        list,
        count,
        one,
        oneByUserId,
        map,
        mapByUserId,
        me,
        meIs,
        getInviteOptions,
        update,
        remove
    };
}
