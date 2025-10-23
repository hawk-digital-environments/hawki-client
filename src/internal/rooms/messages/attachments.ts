import type {Connection} from '../../connection/connection.js';
import type {Room} from '../rooms.js';
import type {UploadedFile} from '../../files/files.js';

export type UploadedAttachment = Pick<UploadedFile, 'mime' | 'name'> & { uuid: string };

export async function uploadAttachmentsIfNeeded(
    connection: Connection,
    room: Room,
    filesToAttach: File | File[] | FileList | undefined
): Promise<UploadedAttachment[] | null> {
    if (!filesToAttach) {
        return null;
    }

    const attachmentFiles = filesToAttach instanceof File ? [filesToAttach] : Array.from(filesToAttach);
    if (attachmentFiles.length === 0) {
        return null;
    }

    const uploadedFiles = await connection.transfer.upload(
        'roomMessagesAttachmentUpload',
        attachmentFiles,
        {
            pathArgs: {
                slug: room.slug
            }
        }
    ).done;

    // Ensure all files have been uploaded and have a UUID
    for (const file of uploadedFiles) {
        if (!file.uuid) {
            throw new Error(`File ${file.name} was not uploaded successfully. No UUID was assigned by the server.`);
        }
    }

    return uploadedFiles.map(file => ({mime: file.mime, name: file.name, uuid: file.uuid!}));
}
