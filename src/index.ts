/**
 * HAWKI Chat Client
 *
 * End-to-end encrypted chat client for HAWKI server.
 * This package provides secure communication, room management,
 * and user authentication for HAWKI chat applications.
 */

export {createHawkiClient} from './HawkiClient.js';
export {createDebugLogger, createSilentLogger} from './internal/logger.js';

export type {Logger} from './internal/logger.js';
export type {HawkiClientOptions} from './HawkiClient.js';
export type {HawkiClient} from './HawkiClient.js';
export type {User} from './internal/users/users.js';
export type {Locale} from './internal/translation/translation.js';
export type {Room, CreateRoomArgs, UpdateRoomArgs} from './internal/rooms/rooms.js';
export type {RoomMessage, RoomMessageAiInfo, RoomMessageAttachment} from './internal/rooms/messages/messages.js';
export type {Member, MemberRole, UserMemberRole} from './internal/rooms/members/members.js';
export type {ReactiveStore, ReactiveStoreSubscriber} from './internal/resources/stores/stores.js';
export type {ReactiveStoreFront, ReactiveStoreFrontProvider} from './internal/resources/stores/ReactiveStoreFront.js';
export type {ProfileUpdateBody} from './internal/profile/profile.js';
export type {StorageFile, AvatarLimits, AttachmentLimits} from './internal/files/files.js';
export type {DefaultModelType, DefaultModelTypeOrAlias, SystemModelType, SystemPromptType} from './internal/ai/ai.js';
