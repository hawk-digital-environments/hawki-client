import type {Connection} from '../../connection/connection.js';
import type {Room} from '../rooms.js';
import type {Member, UserMemberRole} from './members.js';
import {getInviteOptionUsers} from './api.js';

export interface InviteOptionUser {
    isInviteOption: true;
    displayName: string;
    username: string;
    email: string;
    publicKey: string | null;
}

export interface InviteOption extends InviteOptionUser {
    /**
     * Sends an invitation to this user with the specified role.
     * @param role
     */
    invite(role: UserMemberRole): Promise<void>;
}

export async function getInviteOptions(
    connection: Connection,
    room: Room,
    currentMembers: Member[],
    query: string,
    onInviteRequested: (option: InviteOptionUser, role: UserMemberRole) => Promise<void>,
    abort?: AbortController
): Promise<InviteOption[]> {
    const users = await getInviteOptionUsers(
        connection,
        room,
        query,
        abort
    );

    return users
        // The backend may return users that are already members of the room. Exclude them.
        // This is to avoid confusion if the backend does not filter them out.
        // (e.g. if the user was invited but has not yet accepted the invitation)
        // @todo the backend should ideally filter these out itself
        .filter(user => {
            return !currentMembers.some(member => member.user.username === user.username);
        })
        .map(user => ({
            ...user,
            invite: (role: UserMemberRole) => onInviteRequested(user, role)
        }) as InviteOption);
}
