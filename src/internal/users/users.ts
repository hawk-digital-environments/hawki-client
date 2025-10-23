import type {StorageFile, StorageFileRoutePathArgs} from '../files/files.js';
import {defineResource} from '../resources/resources.js';

export interface User {
    id: number;
    isMe: boolean;
    isAi: boolean;
    isRemoved?: boolean; // Present if we created a dummy for a removed user / member
    bio: string | null;
    username: string;
    displayName: string;
    avatar: StorageFile | null;
    employeeType: string;
    createdAt: Date;
    updatedAt: Date;
}

export const UserResource = defineResource<{
    id: number,
    display_name: string,
    username: string,
    avatar_path_args: StorageFileRoutePathArgs | null,
    bio: string | null,
    public_key: string,
    employee_type: string,
    created_at: string,
    updated_at: string
}>()({
    toStoredResource: async (user, {userinfo: {id: currentUserId}}) => ({
        ...user,
        avatar: user.avatar_path_args ? {
            type: 'image',
            path_args: user.avatar_path_args
        } as StorageFile : null,
        avatar_path_args: undefined,
        is_ai: user.id === 1, // Assuming user with ID 1 is AI
        is_me: user.id === currentUserId,
        created_at: new Date(user.created_at),
        updated_at: new Date(user.updated_at)
    }),
    indexedKeys: ['id']
});

export const UserRemovalResource = defineResource<{ id: number }>()({
    transient: true
});
