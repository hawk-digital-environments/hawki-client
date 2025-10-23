import type {Room} from '../rooms.js';
import type {Connection} from '../../connection/connection.js';
import type {RoomInvitation} from './inviteToRoom.js';
import type {InviteOptionUser} from './getInviteOptions.js';
import type {Member, UserMemberRole} from './members.js';

export async function sendInvitation(
    connection: Connection,
    room: Room,
    invitation: RoomInvitation
) {
    await connection.transfer.requestJsonWith('roomInviteMember', {
        invitations: [invitation]
    }, {
        pathArgs: {
            slug: room.slug
        }
    });
}

export async function getInviteOptionUsers(
    connection: Connection,
    room: Room,
    query: string,
    abort?: AbortController
): Promise<InviteOptionUser[]> {
    try {
        const response: { users: { name: string, username: string, email: string, publicKey: string | null }[] } =
            await connection.transfer.requestJsonWith('roomMemberCandidateSearch', {
                query
            }, {
                pathArgs: {
                    slug: room.slug
                },
                signal: abort?.signal
            });

        return response.users.map(user => ({
            isInviteOption: true,
            displayName: user.name,
            username: user.username,
            email: user.email,
            publicKey: user.publicKey
        }));
    } catch (e) {
        // If we did not get a success response, return an empty list.
        return [];
    }
}

export async function updateMemberRole(
    connection: Connection,
    room: Room,
    member: Member,
    newRole: UserMemberRole
) {
    await connection.transfer.requestJsonWith('roomEditMember', {
        username: member.user.username,
        role: newRole
    }, {
        pathArgs: {
            slug: room.slug
        }
    });
}

export async function removeMember(
    connection: Connection,
    room: Room,
    member: Member
) {
    await connection.transfer.requestJsonWith('roomRemoveMember', {
        username: member.user.username
    }, {
        pathArgs: {
            slug: room.slug
        }
    });
}
