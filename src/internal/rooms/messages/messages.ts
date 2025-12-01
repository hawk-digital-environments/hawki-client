import type {Member} from '../members/members.js';
import type {Room} from '../rooms.js';
import type {StorageFile, StorageFileRoutePathArgs} from '../../files/files.js';
import {defineResource} from '../../resources/resources.js';

export interface RoomMessageAiInfo {
    model: string;
}

export interface RoomMessageAttachmentResource extends StorageFile {
    mime: string;
    name: string;
    uuid: string;
    path_args: StorageFileRoutePathArgs;
    category: 'group';
}

export interface RoomMessageAttachment extends RoomMessageAttachmentResource {

}

export interface RoomMessage {
    id: number;
    memberId: number;
    /**
     * Either the member who sent the message, or null if the member has been removed from the room.
     */
    author: Member | null;
    isAi: boolean;
    isRead: boolean;
    readBy: number[];
    isEdited: boolean;
    hasThread: boolean;
    isInThread: boolean;
    content: string;
    ai?: RoomMessageAiInfo;
    threadId: number | null;
    createdAt: Date;
    updatedAt: Date;
    room: Room;
    attachments: RoomMessageAttachment[];
}

export const RoomMessageResource = defineResource<{
    id: number;
    attachments: RoomMessageAttachmentResource[];
    content: string;
    member_id: number;
    model: null | string;
    read_by: number[];
    room_id: number;
    thread_id: number | null;
    has_thread: boolean;
    created_at: string;
    updated_at: string;
}>()({
    toStoredResource: async (resource, {userinfo: {id: userId}}) => {
        return {
            ...resource,
            is_ai: !!resource.model,
            ai: resource.model ? {model: resource.model} : undefined,
            is_read: resource.read_by.includes(userId) ? 1 : 0,
            is_edited: resource.created_at !== resource.updated_at,
            thread_id: resource.thread_id ?? -1,
            created_at: new Date(resource.created_at),
            updated_at: new Date(resource.updated_at)
        };
    },
    indexedKeys: [
        'id',
        'thread_id',
        'room_id',
        'is_read',
        'created_at'
    ],
    compoundIndexes: [
        ['room_id', 'is_read'],
        ['room_id', 'thread_id'],
        ['thread_id', 'room_id', 'created_at'],
        ['room_id', 'id']
    ]
});
