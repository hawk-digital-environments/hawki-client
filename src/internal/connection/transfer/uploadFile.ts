import type {TransferUrlBuilder, TransferUrlOptions} from './urlBuilder.js';
import type {Logger} from '../../logger.js';
import type {TransferRoute} from '../connection.js';
import {
    createStoreFront,
    createStoreFrontProvider,
    type ReactiveStoreFront
} from '../../resources/stores/ReactiveStoreFront.js';
import {createGenericStore} from '../../resources/stores/GenericStore.js';
import {createDerivedStore} from '../../resources/stores/DerivedStore.js';
import {extractFileInfo} from '../../files/utils.js';
import {transferWorker} from './transferWorker.js';
import type {UploadedFile} from '../../files/files.js';
import type {EventBus} from '../../events/EventBus.js';

export type FileUpload = ReturnType<ReturnType<typeof createFileUploadHandler>>;

export type FileUploadOptions = TransferUrlOptions & {
    /**
     * The name of the form field to use for the file upload.
     * If not provided, 'file' will be used.
     */
    fieldName?: string;

    /**
     * A callback that is invoked before the worker starts processing the files.
     * This can be used to perform validations or setup tasks, that directly affect the "done" promise of the upload.
     */
    beforeWorkerStarts?: () => void | Promise<void>
}

export function createFileUploadHandler(
    authenticationHeaders: RequestInit['headers'],
    isConnected: () => boolean,
    buildUrl: TransferUrlBuilder,
    log: Logger,
    eventBus: EventBus
) {

    return function (
        path: TransferRoute, fileOrFiles: File | File[] | FileList,
        options?: FileUploadOptions
    ) {
        if (!isConnected()) {
            throw new Error('The connection has been closed, you can not use the upload handle anymore.');
        }

        const filesToUpload = fileOrFiles instanceof File ? [fileOrFiles] : Array.from(fileOrFiles);
        const fileCount = filesToUpload.length;

        const url = buildUrl(path, options);
        log.info(`Starting upload to ${url} for ${fileCount} files:`, fileOrFiles);

        const progressStoreFront = createStoreFrontProvider(() => createGenericStore(0));

        const fileProgressMap = new Map<File, ReactiveStoreFront<number>>();
        let c = 0;
        for (const file of filesToUpload) {
            fileProgressMap.set(file, progressStoreFront.get((c++).toString()));
        }

        const progressOfFile = (file: File) => {
            if (!fileProgressMap.has(file)) {
                throw new Error('The provided file is not part of the current upload session.');
            }
            return fileProgressMap.get(file)!;
        };

        const totalProgress = createStoreFront(
            () => createDerivedStore(
                Array.from(fileProgressMap.values()),
                (...values: number[]) => {
                    const total = values.reduce((acc, val) => acc + val, 0);
                    return total / fileCount;
                },
                0
            )
        );

        const onCancel: (() => void)[] = [];

        const uploadSingleFile = async (file: File): Promise<string | null> => {
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                const formData = new FormData();
                formData.append(options?.fieldName || 'file', file, file.name);

                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable) {
                        const percent = Math.round((event.loaded / event.total) * 100);
                        fileProgressMap.get(file)?.set(percent);
                    }
                });

                xhr.addEventListener('load', () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        fileProgressMap.get(file)?.set(100);
                        let responseData;
                        try {
                            responseData = JSON.parse(xhr.responseText);
                        } catch (e) {
                            reject(new Error('Failed to parse server response.'));
                            return;
                        }
                        if (typeof responseData !== 'object' || responseData === null) {
                            reject(new Error('Invalid response from server, expected an object.'));
                            return;
                        }
                        if (responseData.success && !responseData.uuid) {
                            // If the response indicates success but does not provide a uuid, we return null
                            resolve(null);
                            return;
                        }
                        if (responseData.success === false) {
                            reject(new Error('Upload failed: ' + (responseData.message || 'No details provided')));
                            return;
                        }
                        if (!responseData.uuid) {
                            reject(new Error('Invalid response from server, missing file UUID.'));
                            return;
                        }
                        if (typeof responseData['_hawki_sync_log'] === 'object') {
                            eventBus.dispatchSyncLogInResponseEvent(responseData['_hawki_sync_log']);
                        }
                        resolve(responseData.uuid as string);
                    } else {
                        reject(new Error(`Upload failed with status ${xhr.status}.`));
                    }
                });

                xhr.addEventListener('error', () => {
                    reject(new Error('A network error occurred during file upload.'));
                });

                xhr.addEventListener('abort', () => {
                    reject(new Error('File upload aborted.'));
                });

                xhr.open(url.method ?? 'POST', url, true);

                for (const header in authenticationHeaders) {
                    xhr.setRequestHeader(header, authenticationHeaders[header as keyof typeof authenticationHeaders] as string);
                }

                log.info(`Uploading file ${file.name} (${file.size} bytes) to ${url}`);
                xhr.send(formData);

                onCancel.push(() => {
                    xhr.abort();
                    reject(new Error('Stopping upload of file ' + file.name + ' due to cancellation request.'));
                });
            });
        };

        const {done, cancel, isCancelled} = transferWorker(
            filesToUpload.map(file => async () => {
                const uuid = await uploadSingleFile(file);
                if (isCancelled()) {
                    return null;
                }
                fileProgressMap.get(file)?.set(100);
                log.info(`Finished upload of file ${file.name} (${file.size} bytes) to ${url}, UUID: ${uuid}`);
                return {
                    ...extractFileInfo(file),
                    uuid
                };
            }),
            3,
            options?.beforeWorkerStarts,
            () => onCancel.forEach(fn => fn())
        );

        return {
            progress: totalProgress,
            progressOfFile,
            cancel,
            done: done as Promise<UploadedFile[]>
        };
    };
}
