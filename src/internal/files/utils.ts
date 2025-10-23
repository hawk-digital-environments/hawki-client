import type {FileInfo} from './files.js';
import type {Connection} from '../connection/connection.js';

export function extractFileInfo(file: File): FileInfo {
    let type: FileInfo['type'];
    if (file.type.startsWith('image/')) {
        type = 'image';
    } else {
        type = 'document';
    }

    return {
        name: file.name,
        mime: file.type,
        size: file.size,
        lastModified: new Date(file.lastModified),
        type
    };
}

export function validateAvatarLimits(connection: Connection, avatar: File): void {
    const avatarLimits = connection.client.files.avatarLimits();
    if (avatarLimits.maxSize > 0 && avatar.size > avatarLimits.maxSize) {
        throw new Error(`Avatar file is too large, maximum size is ${avatarLimits.maxSize} bytes`);
    }
    if (avatarLimits.mimeTypes.length > 0 && !avatarLimits.mimeTypes.includes(avatar.type)) {
        throw new Error(`Avatar file type is not allowed, allowed types are: ${avatarLimits.mimeTypes.join(', ')}`);
    }
}
