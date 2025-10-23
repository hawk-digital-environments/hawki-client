import {defineResource} from '../resources/resources.js';
import type {StorageFile, StorageFileRoutePathArgs} from '../files/files.js';

export interface CreateRoomArgs {
    name: Room['name'];
    description?: Room['description'];
    systemPrompt?: Room['systemPrompt'];
}

export interface UpdateRoomArgs extends Partial<CreateRoomArgs> {
}

export interface Room {
    id: number;
    slug: string;
    name: string;
    description: string | null;
    systemPrompt: string | null;
    avatar: StorageFile | null;
    createdAt: Date;
    updatedAt: Date;
    lastMessageAt: Date | null;
}

export const RoomResource = defineResource<{
    id: number;
    name: string;
    slug: string;
    avatar_path_args: StorageFileRoutePathArgs | null;
    system_prompt: string;
    room_description: string | null;
    created_at: string;
    updated_at: string;
}>()({
    toStoredResource: async (room) => ({
        ...room,
        avatar: room.avatar_path_args ? {
            type: 'image',
            path_args: room.avatar_path_args
        } as StorageFile : null,
        avatar_path_args: undefined,
        created_at: new Date(room.created_at),
        updated_at: new Date(room.updated_at)
    }),
    indexedKeys: ['id', 'slug']
});

export const RoomInvitationResource = defineResource<{
    id: number;
    invitation: string;
    iv: string;
    room_id: number;
    room_slug: string;
    tag: string;
}>()({
    transient: true
});
