import type {User} from '../../users/users.js';
import {defineResource} from '../../resources/resources.js';

export type MemberRole = 'assistant' | 'admin' | 'editor' | 'viewer';
export type UserMemberRole = Exclude<MemberRole, 'assistant'>;

export interface Member {
    id: number;
    userId: number;
    role: MemberRole;
    roomId: number;
    createdAt: Date;
    updatedAt: Date;
    user: User;
}

export const MemberResource = defineResource<{
    id: number;
    user_id: number;
    role: MemberRole;
    room_id: number;
    created_at: string;
    updated_at: string;
}>()({
    toStoredResource: async (member) => ({
        ...member,
        created_at: new Date(member.created_at),
        updated_at: new Date(member.updated_at)
    }),
    indexedKeys: ['id', 'user_id', 'room_id'],
    compoundIndexes: [['room_id', 'user_id']]
});
