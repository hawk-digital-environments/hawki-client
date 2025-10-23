import type {Connection} from '../connection/connection.js';
import type {Room, UpdateRoomArgs} from './rooms.js';
import {isNonEmptyString} from '../guards.js';
import type {RoomKeys} from '../encryption/keychain/KeychainHandle.js';
import {encryptSymmetric} from '../encryption/symmetric.js';

export async function createRoom(
    connection: Connection,
    name: string
): Promise<{ id: number, slug: string }> {
    const response = (await connection.transfer.requestJsonWith('roomCreate', {
        room_name: name
    }));

    return {
        id: response.roomData.id,
        slug: response.roomData.slug
    };
}

export async function updateRoom(
    connection: Connection,
    slug: string,
    changes: UpdateRoomArgs,
    roomKeys: RoomKeys
): Promise<void> {
    let hasChanges = false;
    const payload: any = {};
    if (isNonEmptyString(changes.name)) {
        payload.name = changes.name;
        hasChanges = true;
    }
    if (isNonEmptyString(changes.description)) {
        payload.description = (await encryptSymmetric(changes.description, roomKeys.roomKey)).toJson();
        hasChanges = true;
    }
    if (isNonEmptyString(changes.systemPrompt)) {
        payload.system_prompt = (await encryptSymmetric(changes.systemPrompt, roomKeys.roomKey)).toJson();
        hasChanges = true;
    }

    if (!hasChanges) {
        return;
    }

    await connection.transfer.requestJsonWith('roomUpdate', payload, {
        pathArgs: {
            slug: slug
        }
    });
}

export async function leaveRoom(
    connection: Connection,
    room: Room
): Promise<void> {
    await connection.transfer.requestJson('roomLeave', {
        pathArgs: {
            slug: room.slug
        }
    });
}

export async function removeRoom(
    connection: Connection,
    room: Room
): Promise<void> {
    await connection.transfer.requestJson('roomRemove', {
        pathArgs: {
            slug: room.slug
        }
    });
}

export async function acceptInvitation(
    connection: Connection,
    invitationId: number
): Promise<void> {
    await connection.transfer.requestJsonWith('roomInvitationAccept', {
        invitation_id: invitationId
    });
}
