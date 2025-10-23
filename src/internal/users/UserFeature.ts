import {currentUserRemovalHandling} from './currentUserRemovalHandling.js';
import {defineFeature} from '../features/features.js';
import type {ResourceStoredType} from '../resources/resources.js';
import type {User} from './users.js';
import {deriveMap} from '../resources/stores/utils.js';

export const UserFeature = defineFeature((connection) => {
    const records = connection.resourceDb.getTable('user');

    currentUserRemovalHandling(connection);

    const convertResourceToModel = async (resource: ResourceStoredType<'user'>): Promise<User> => ({
        id: resource.id,
        isMe: resource.is_me,
        isAi: resource.is_ai,
        username: resource.username,
        displayName: resource.display_name,
        bio: resource.bio,
        avatar: resource.avatar,
        employeeType: resource.employee_type,
        createdAt: resource.created_at,
        updatedAt: resource.updated_at
    });

    /**
     * Get a list of all users.
     * Note: This could be a large list, depending on the application.
     * Note²: This contains ONLY SYNCED users; e.g. users that are somehow related to the current user.
     */
    const list = () => records.list.get('default')
        .derive('models', async (resources) => Promise.all(
            resources.map(convertResourceToModel)
        ));

    /**
     * Get a map of all users, keyed by their ID.
     * Note: This could be a large map, depending on the application.
     * Note²: This contains ONLY SYNCED users; e.g. users that are somehow related to the current user.
     */
    const map = () => list()
        .derive(
            'map', (models) =>
                deriveMap(models, (model) => model.id),
            []
        );

    /**
     * Get a map of all users, keyed by their username.
     * Note: This could be a large map, depending on the application.
     * Note²: This contains ONLY SYNCED users; e.g. users that are somehow related to the current user.
     */
    const mapByUsername = () => list()
        .derive(
            'mapByUsername', (models) =>
                deriveMap(models, (model) => model.username),
            []
        );

    /**
     * Get a specific user by their ID.
     * @param id The ID of the user to retrieve.
     */
    const one = (id: number) =>
        records.one.get(id.toString(), id)
            .derive('model', (resource) => resource ? convertResourceToModel(resource) : null);

    /**
     * Get the current logged-in user.
     */
    const current = () => one(connection.userinfo.id);

    const search = (query: string) => {
        throw new Error('User search not implemented');
    };

    return {
        list,
        map,
        mapByUsername,
        one,
        current,
        search
    };
});
