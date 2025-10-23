import type {FileUpload} from '../connection/transfer/uploadFile.js';
import type {ProfileUpdateBody} from './profile.js';
import {updateProfile as updateProfileRequest} from './api.js';
import {defineFeature} from '../features/features.js';
import {validateAvatarLimits} from '../files/utils.js';

export const ProfileFeature = defineFeature((connection) => {
    const currentUserId = connection.userinfo.id;

    /**
     * Returns the current user's profile.
     * The value is a reactive store that updates automatically when the profile changes.
     */
    const me = () =>
        connection.client.users.one(currentUserId);

    /**
     * Sets the user's avatar by uploading a new image file.
     * @param avatar
     */
    const setAvatar = (avatar: File): FileUpload => {
        return connection.transfer.upload(
            'profileAvatarUpload',
            avatar,
            {
                fieldName: 'image',
                beforeWorkerStarts: () => validateAvatarLimits(connection, avatar)
            }
        );
    };

    /**
     * Updates the user's profile with the given changes.
     * @param changes
     */
    const update = (changes: ProfileUpdateBody) =>
        updateProfileRequest(connection, changes);

    return {
        me,
        setAvatar,
        update
    };
});
