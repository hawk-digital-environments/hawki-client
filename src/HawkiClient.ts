import {createSilentLogger, type Logger} from './internal/logger.js';
import {
    type Connection,
    type ExternalConnectOptions,
    type InternalConnectOptions
} from './internal/connection/connection.js';
import {createEventBus, type EventBus} from './internal/events/EventBus.js';
import {type FeatureInstances, type FeatureProvider} from './internal/features/features.js';
import {connectInternal} from './internal/connection/internal/connectInternal.js';
import {connectExternal} from './internal/connection/external/connectExternal.js';
import {AiFeature} from './internal/ai/AiFeature.js';
import {SyncFeature} from './internal/resources/sync/SyncFeature.js';
import {EventFeature} from './internal/events/EventFeature.js';
import {RoomFeature} from './internal/rooms/RoomFeature.js';
import {UserFeature} from './internal/users/UserFeature.js';
import {FileFeature} from './internal/files/FileFeature.js';
import {ProfileFeature} from './internal/profile/ProfileFeature.js';
import {UserRemovalResource, UserResource} from './internal/users/users.js';
import {AiModelResource, SystemPromptResource} from './internal/ai/ai.js';
import {MemberResource} from './internal/rooms/members/members.js';
import type {ReactiveStoreFront} from './internal/resources/stores/ReactiveStoreFront.js';
import {RoomInvitationResource, RoomResource} from './internal/rooms/rooms.js';
import {RoomAiWritingResource} from './internal/rooms/typing/typing.js';
import {RoomMessageResource} from './internal/rooms/messages/messages.js';
import {FeatureFlagsFeature} from './internal/features/FeatureFlagsFeature.js';
import {TranslationFeature} from './internal/translation/TranslationFeature.js';
import {UserKeychainValueResource} from './internal/encryption/keychain/keychain.js';

/**
 * This is the main interface of the public HAWKI client API.
 * It exposes all the available features as properties.
 * Each feature is responsible for a specific domain of the application,
 * such as rooms, users, files, AI, etc.
 */
export interface HawkiClient extends FeatureInstances {
    /**
     * This property indicates whether the client is currently connected to the server.
     * It is a reactive store, so you can subscribe to changes.
     * When the client is disconnected, all features will be disabled and cannot be used.
     * Once the connection has been terminated, it cannot be re-established;
     * a new client instance must be created to connect again.
     */
    readonly connected: ReactiveStoreFront<boolean>;

    /**
     * Disconnects the client from the server and disables all features.
     * This method will NOT clear any local data or state.
     * If you want to clear all local data, pass `true` as the first argument.
     * @param clear If true, all local data and state will be cleared.
     *              Note, resyncing will be required when the client is reconnected;
     *              this is a fairly expensive operation and should be considered carefully.
     *              If you only want to log out the current user, do not clear the local data,
     *              everything will be preserved and the user can log back in without resyncing.
     *              The messages are stored encrypted, without the user credentials they cannot be decrypted.
     *              Defaults to false.
     */
    disconnect(clear?: boolean): Promise<void>;
}

export type HawkiClientOptions = {
    /**
     * By default, the client will use a silent logger that does not output anything.
     * For debugging purposes, you can provide your own logger implementation.
     * The logger should implement the `Logger` interface.
     */
    logger?: Logger;
    /**
     * By default, the client will automatically start syncing data
     * as soon as the connection is established.
     * If you want to control when the sync starts, set this option to `false`.
     * You can then start the sync manually by calling `client.sync.syncAll()`.
     * Note that some features may not work properly until the initial sync is complete.
     * Defaults to `true`.
     */
    autoSync?: boolean;
} & (InternalConnectOptions | ExternalConnectOptions);

/**
 * A list of all known/expected route names that the hawki backend provides.
 * This is used to type the `routes` object in the connection config.
 * This list is also used to validate the routes object returned by the backend.
 */
export const knownRouteNames = [
    'syncLog',
    'keychainPasskeyValidator',
    'keychainUpdate',
    'profileUpdate',
    'profileAvatarUpload',
    'storageProxy',
    'roomCreate',
    'roomUpdate',
    'roomRemove',
    'roomMemberCandidateSearch',
    'roomInviteMember',
    'roomEditMember',
    'roomRemoveMember',
    'roomLeave',
    'roomInvitationAccept',
    'roomAvatarUpload',
    'roomMessagesMarkRead',
    'roomMessagesSend',
    'roomMessagesEdit',
    'roomMessagesAiSend',
    'roomMessagesAttachmentUpload'
] as const;

/**
 * Defines the list of all available features of the client.
 * A feature is one of the "main properties" of the public client API,
 * such as `client.rooms`, `client.users`, `client.files`, etc.
 * Each feature is responsible for a specific domain of the application.
 *
 * Use the `defineFeature` helper to create a feature provider.
 * This ensures proper typing and consistency across the codebase.
 */
export const features = {
    ai: AiFeature,
    sync: SyncFeature,
    events: EventFeature,
    rooms: RoomFeature,
    users: UserFeature,
    files: FileFeature,
    profile: ProfileFeature,
    featureFlags: FeatureFlagsFeature,
    translation: TranslationFeature
} as const;

/**
 * Defines the list of all available resource definitions.
 * A resource definition describes the shape and behavior of a specific resource,
 * such as `ai_model`, `user`, `file`, etc.
 *
 * Resources are used internally by features to manage data and state.
 * They are not directly exposed to the public client API.
 *
 * Use the `defineResource` helper to create a resource definition.
 * It allows you to specify storage options, indexing, and migrations.
 */
export const resources = {
    ai_model: AiModelResource,
    user: UserResource,
    user_removal: UserRemovalResource,
    member: MemberResource,
    room: RoomResource,
    room_invitation: RoomInvitationResource,
    room_ai_writing: RoomAiWritingResource,
    room_message: RoomMessageResource,
    system_prompt: SystemPromptResource,
    user_keychain_value: UserKeychainValueResource
} as const;

/**
 * The main entry point to create a HAWKI client instance.
 * This function initializes the connection, loads features, and prepares the client for use.
 * The client instance will be returned once the initialization is complete.
 *
 * Example usage:
 * ```ts
 * import { createHawkiClient } from '@lib/HawkiClient';
 *
 * const client = await createHawkiClient({
 *   type: 'internal',
 *   logger: myCustomLogger, // optional
 * });
 * ```
 */
export async function createHawkiClient(options: HawkiClientOptions): Promise<HawkiClient> {
    if (typeof options !== 'object' || options === null) {
        throw new Error('Options must be an object');
    }

    const log = options.logger || createSilentLogger();
    const bootLog = log.withPrefix('Bootstrap');
    const eventBus = createEventBus(log);

    bootLog.debug('Creating HAWKI connection');
    const connection = await connect(options, log, bootLog, eventBus);

    bootLog.debug('Registering features');
    await loadFeatures(connection, options);

    bootLog.debug('Starting initialization sequence');
    await eventBus.dispatchInit(connection.client);

    bootLog.info('HAWKI client is ready');
    return connection.client;
}

/**
 * Selects and establishes the appropriate connection based on the provided options.
 * Supports both internal and external connection types.
 */
function connect(options: HawkiClientOptions, log: Logger, bootLog: Logger, eventBus: EventBus): Promise<Connection> {
    try {
        if (options.type === 'internal') {
            return connectInternal(eventBus, options, log, bootLog);
        }

        if (options.type === 'external') {
            return connectExternal(eventBus, options, log, bootLog);
        }
    } catch (error) {
        bootLog.error('Error during connection initialization', error);
        throw error;
    }

    throw new Error(`Unsupported connection type: ${(options as any).type}`);
}

/**
 * Uses the configured features to load and register them into the connection.
 * @param connection
 * @param options
 */
async function loadFeatures(connection: Connection, options: HawkiClientOptions) {
    const promises: Promise<void>[] = [];

    connection.features.clear();

    for (const [key, feature] of Object.entries(features) as [keyof typeof features, FeatureProvider][]) {
        const log = connection.log.withPrefix(`Feature(${key})`);
        promises.push(Promise.resolve(feature({...connection, log}, options))
            .then((instance) => {
                log.debug(`Registered feature: ${key}`);
                connection.features.set(key, instance);
            })
            .catch(err => {
                connection.log.error(`Failed to register feature: ${key}`, err);
                throw err;
            }));
    }

    await Promise.all(promises);
}
