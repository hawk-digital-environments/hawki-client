import type {Room} from '../rooms.js';
import type {User} from '../../users/users.js';
import type {UserMemberRole} from './members.js';
import type {Connection} from '../../connection/connection.js';
import {encryptKeyAsymmetric, loadPublicKey} from '../../encryption/asymmetric.js';
import type {RoomKeys} from '../../encryption/keychain/KeychainHandle.js';
import {deriveKey, type ServerSalt} from '../../encryption/utils.js';
import {encryptKeySymmetric} from '../../encryption/symmetric.js';
import {sendInvitation} from './api.js';
import type {InviteOptionUser} from './getInviteOptions.js';


export type RoomInvitation = {
    username: string,
    encryptedRoomKey: string,
    iv: string,
    tag: string,
    role: UserMemberRole,
    /**
     * If present, indicates that the invite was created without a public key,
     * and this tempHash should be sent to the user via email.
     */
    email?: {
        tempHash: string
    }
}

export async function inviteToRoom(
    connection: Connection,
    room: Room,
    user: User | InviteOptionUser,
    role: UserMemberRole
) {
    const roomKeys = await connection.keychain.roomKeysOf(room).getAsync(100);

    if (!roomKeys) {
        throw new Error('Room keys not found for room ' + room.id);
    }

    const invitation = ('publicKey' in user && user.publicKey && user.publicKey.length > 0)
        ? await createInvitationWithPublicKey(user, roomKeys, role, user.publicKey)
        : await createInvitationWithoutPublicKey(connection.config.salts.invitation, user, roomKeys, role);

    await sendInvitation(connection, room, invitation);
}

async function createInvitationWithPublicKey(
    user: User | InviteOptionUser,
    roomKeys: RoomKeys,
    role: UserMemberRole,
    publicKey: string
) {
    const encryptedRoomKey = await encryptKeyAsymmetric(roomKeys.roomKey, await loadPublicKey(publicKey));

    return {
        username: user.username,
        encryptedRoomKey: encryptedRoomKey,
        iv: '0',
        tag: '0',
        role: role
    } satisfies RoomInvitation;
}

async function createInvitationWithoutPublicKey(
    invitationSalt: ServerSalt,
    user: User | InviteOptionUser,
    roomKeys: RoomKeys,
    role: UserMemberRole
) {
    const tempHash = generateTempHash();
    const derivedKey = await deriveKey(tempHash, 'invitation_key', invitationSalt);
    const encryptedRoomKey = (await encryptKeySymmetric(roomKeys.roomKey, derivedKey)).toObject();

    return {
        username: user.username,
        encryptedRoomKey: encryptedRoomKey.ciphertext,
        iv: encryptedRoomKey.iv,
        tag: encryptedRoomKey.tag,
        role: role,
        email: {
            tempHash
        }
    } satisfies RoomInvitation;
}

function generateTempHash(): string {
    const array = new Uint8Array(16); // 16 bytes = 128 bits
    window.crypto.getRandomValues(array);
    return Array.from(array)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}
