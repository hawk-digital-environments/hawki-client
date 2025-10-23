import type {User} from './users.js';

export function createRemovedUserDummy(): User {
    return {
        id: -1,
        isMe: false,
        isAi: false,
        bio: null,
        isRemoved: true,
        username: 'removed_user',
        displayName: 'Removed User',
        avatar: null,
        employeeType: 'former',
        createdAt: new Date(0),
        updatedAt: new Date(0)
    };
}
