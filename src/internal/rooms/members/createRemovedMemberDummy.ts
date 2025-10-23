import type {Member} from './members.js';
import {createRemovedUserDummy} from '../../users/createRemovedUserDummy.js';

export function createRemovedMemberDummy(memberId: number, roomId: number): Member {
    return {
        id: memberId,
        userId: -1,
        role: 'viewer',
        roomId,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        user: createRemovedUserDummy()
    };
}
