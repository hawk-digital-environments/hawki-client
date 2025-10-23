import type {CommonConnectionConfig} from '../connection/connection.js';

export interface StorageFileRoutePathArgs {
    category: string;
    filename: string;
}

export interface StorageFile {
    type: 'image' | 'document';
    path_args: StorageFileRoutePathArgs;
}

export interface FileInfo {
    type: 'image' | 'document';
    name: string;
    mime: string;
    size: number;
    lastModified: Date;
}

export interface UploadedFile extends FileInfo {
    uuid: string | null;
}

export interface AvatarLimits {
    maxSize: CommonConnectionConfig['storage']['maxAvatarFileSize'],
    mimeTypes: CommonConnectionConfig['storage']['allowedAvatarMimeTypes']
}

export interface AttachmentLimits {
    maxSize: CommonConnectionConfig['storage']['maxFileSize'],
    mimeTypes: CommonConnectionConfig['storage']['allowedMimeTypes'],
    maxFiles: CommonConnectionConfig['storage']['maxAttachmentFiles']
}
