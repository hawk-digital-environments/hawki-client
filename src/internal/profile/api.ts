import type {Connection} from '../connection/connection.js';
import type {ProfileUpdateBody} from './profile.js';

export async function updateProfile(
    connection: Connection,
    changes: ProfileUpdateBody
) {
    await connection.transfer.requestJsonWith('profileUpdate', changes);
}
