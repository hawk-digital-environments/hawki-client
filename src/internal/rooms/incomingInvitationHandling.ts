import type {Connection} from '../connection/connection.js';
import {decryptKeyAsymmetric} from '../encryption/asymmetric.js';
import {acceptInvitation} from './api.js';
import type {ResourceType} from '../resources/resources.js';

export function incomingInvitationHandling(connection: Connection): void {
    const {eventBus, log, keychain} = connection;

    const acceptInvitationAndSyncRoom = async (invitation: ResourceType<'room_invitation'>) => {
        try {
            await acceptInvitation(connection, invitation.id);
        } catch (e) {
            log.warning(`Received an error while accepting invitation ${invitation.id}:`, e);
        }

        await connection.client.sync.room(invitation.room_id);
    };

    const acceptInvitationByPublicKey = async (invitation: ResourceType<'room_invitation'>) => {
        const privateKey = await keychain.privateKey().getAsyncAsserted();
        const roomKey = await decryptKeyAsymmetric(invitation.invitation.substring(10), privateKey);
        log.info(`Accepting invitation ${invitation.id} to room ${invitation.room_id} (${invitation.room_slug})`);
        keychain.importRoomKey(invitation.room_slug, roomKey);
        await acceptInvitationAndSyncRoom(invitation);
    };

    eventBus.onSyncEvent('room_invitation', 'set', async (invitation) => {
        // MA==|MA==| means base64 encoded 0|0|, which means the sender used our public key to encrypt the room key
        if (invitation.invitation.startsWith('MA==|MA==|')) {
            await acceptInvitationByPublicKey(invitation);
        }
    });
}
