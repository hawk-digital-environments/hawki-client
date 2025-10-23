import {defineResource} from '../../resources/resources.js';

export const userKeychainValueTypes = ['private_key', 'public_key', 'room_key', 'room_ai', 'room_ai_legacy', 'ai_conv'] as const;

export type UserKeychainValueType = (typeof userKeychainValueTypes)[number];

export const UserKeychainValueResource = defineResource<{
    id: number;
    key: string;
    value: string;
    type: UserKeychainValueType
}>()({
    indexedKeys: ['key', 'type']
});
