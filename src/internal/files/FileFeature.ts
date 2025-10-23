import type {AttachmentLimits, AvatarLimits, StorageFile} from './files.js';
import type {RoomMessageAttachment} from '../rooms/messages/messages.js';
import {defineFeature} from '../features/features.js';

export const FileFeature = defineFeature((connection) => {
    const {transfer} = connection;

    const loadingBlobs = new Map<string, Promise<Blob>>();
    const getBlob = async (file: StorageFile) => {
        if (typeof file.path_args !== 'object' || !file.path_args.category || !file.path_args.filename) {
            throw new Error('Invalid file path arguments');
        }
        
        const key = file.path_args.category + '/' + file.path_args.filename;
        if (loadingBlobs.has(key)) {
            return loadingBlobs.get(key)!;
        }

        const promise = transfer.requestBlob('storageProxy', {
            pathArgs: file.path_args as any
        });

        loadingBlobs.set(key, promise);

        try {
            return await promise;
        } finally {
            loadingBlobs.delete(key);
        }
    };

    const getDataUrl = async (file: StorageFile) => {
        const blob = await getBlob(file);
        return new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (reader.result && typeof reader.result === 'string') {
                    resolve(reader.result);
                } else {
                    reject(new Error('Failed to convert blob to data URL'));
                }
            };
            reader.onerror = () => {
                reject(new Error('Failed to read blob as data URL'));
            };
            reader.readAsDataURL(blob);
        });
    };

    const getImgElement = async (file: StorageFile) => {
        if (file.type !== 'image') {
            // Create a placeholder image
            const img = document.createElement('img');
            img.alt = 'Not an image';
            img.width = 100;
            img.height = 100;
            img.src = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzAwMCIgc3Ryb2tlLXdpZHRoPSIzIiB2aWV3Qm94PSIwIDAgNjQgNjQiPjxwYXRoIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgZD0ibTQwIDE5LTUtNCA1LTMtNS00aDE3djM1TDQwIDU2SDE1VjhoMTJsMyA0LTMgNCA1IDQtNCA5aDBaIi8+PHBhdGggZD0iTTQwIDU2VjQzaDEyIi8+PC9zdmc+';
            return img;
        }

        const dataUrl = await getDataUrl(file);
        const img = document.createElement('img');
        img.src = dataUrl;
        img.alt = (file as RoomMessageAttachment)?.name || 'Image';
        return img;
    };

    const download = async (file: StorageFile, filename?: string) => {
        // We must download the blob, because we need to use our authenticated fetch
        const blob = await getBlob(file);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || (file as RoomMessageAttachment)?.name || 'download';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
    };

    const storageConfig = connection.config.storage;
    const avatarLimits = (): AvatarLimits => {
        return {
            maxSize: storageConfig.maxAvatarFileSize,
            mimeTypes: storageConfig.allowedAvatarMimeTypes
        };
    };

    const attachmentLimits = (): AttachmentLimits => {
        return {
            maxSize: storageConfig.maxFileSize,
            mimeTypes: storageConfig.allowedMimeTypes,
            maxFiles: storageConfig.maxAttachmentFiles
        };
    };

    return {
        getBlob,
        getDataUrl,
        getImgElement,
        download,
        avatarLimits,
        attachmentLimits
    };
});
