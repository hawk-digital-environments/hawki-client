import type {Logger} from '../logger.js';
import {type HawkiClient, knownRouteNames} from '../../HawkiClient.js';
import type {DefaultModelType, SystemModelType} from '../ai/ai.js';
import type {EventBus} from '../events/EventBus.js';
import type {Feature, FeatureKey} from '../features/features.js';
import type {KeychainHandle} from '../encryption/keychain/KeychainHandle.js';
import type {TransferHandle} from './transfer/TransferHandle.js';
import type {ServerSalt} from '../encryption/utils.js';
import type {ResourceDb} from '../resources/db/ResourceDb.js';
import type {ReactiveStoreFront} from '../resources/stores/ReactiveStoreFront.js';
import type {LocaleCode, LocaleRecord} from '../translation/translation.js';
import type {ClientLocale} from '../translation/clientLocale.js';
import type {FeatureFlags} from '../features/FeatureFlags.js';

interface ConnectionBase {
    /**
     * Contains the state of the connection. True if connected, false if disconnected.
     * This is a reactive store, so you can subscribe to it to get notified of changes.
     * Once the connection has been terminated, it cannot be re-established;
     * a new connection must be created to connect again.
     */
    readonly connected: ReactiveStoreFront<boolean>;

    /**
     * A map of all available features, keyed by their feature key.
     * A feature is a specific domain of the application, such as rooms, users, files, AI, etc.
     * You can access a specific feature by using the `client.<featureKey>` property,
     * for example `client.rooms` to access the RoomFeature.
     *
     * Note: if you try to access a feature when the client is not connected,
     * an error will be thrown. You should always check the `connected` property
     * before accessing any features.
     */
    readonly features: Map<FeatureKey, Feature<FeatureKey>>;

    /**
     * A helper object to check the state of feature flags.
     * Feature flags are used to enable or disable specific features
     * on the server side.
     *
     * This is NOT DIRECTLY RELATED to the `features` map above, which contains
     * the actual feature implementations.
     *
     * Feature flags refer to server-side configuration options that enable or disable
     * certain functionalities or behaviors within the HAWKI client.
     */
    readonly featureFlags: FeatureFlags;

    /**
     * The locale object used for this connection. This defines the language
     * used for all requests and translations.
     * It can be changed later by using the `client.translation.setLocale` method.
     * This is a reactive store, so you can subscribe to it to get notified of changes.
     */
    readonly locale: ClientLocale;

    /**
     * The abstraction layer above the indexedDb, providing access to the persisted resources.
     * Each resource type has its own table, which can be accessed using the `resourceDb.table('<resourceType>')` method.
     */
    readonly resourceDb: ResourceDb;

    /**
     * Gives access to the main HAWKI client API.
     * This is the same object that will be returned when calling the `createHawkiClient` function.
     * It is provided here to allow high-level cross-feature access of functionality.
     */
    readonly client: HawkiClient;

    /**
     * The main event bus used for dispatching and listening to events.
     * In its core the client is event-driven, and many operations are performed
     * by listening to specific events.
     *
     * You can also use this event bus to listen to low-level events, but be careful
     * not to interfere with the normal operation of the client.
     *
     * A subset of functions provided by the bus will be exposed on the public `client.events` feature.
     */
    readonly eventBus: EventBus;

    /**
     * Basic information about the connected user.
     * This is a copy of the `userinfo` object provided in the connection config,
     * and can be used to display the username or email in your UI.
     */
    readonly userinfo: Userinfo;

    /**
     * The keychain handle provides access to the user's keychain,
     * which contains all encryption keys needed for accessing encrypted data.
     * The keychain is decrypted using the user's passkey, which is provided
     * during the connection process.
     *
     * The keychain handle provides methods to get and set keys, as well as
     * to check if a key exists.
     */
    readonly keychain: KeychainHandle;

    /**
     * Exactly what it says on the tin - a logger instance that can be used
     * to log messages. By default, this is a silent logger that does not output anything.
     * You can provide your own logger implementation when creating the connection,
     * or use a logging wrapper to add prefixes or other functionality.
     */
    readonly log: Logger;

    /**
     * The transfer handle is responsible for all network communication with the server.
     * It provides a preconfigured fetch handler with wrappers on top with an opinionated interface for the HAWKI api.
     * While creating the connection, the transfer handle is configured with the base url and headers for authentication.
     * It also manages the websocket connection used for real-time updates.
     */
    readonly transfer: TransferHandle;
}

export interface InternalConnection extends ConnectionBase {
    readonly type: InternalConnectOptions['type'];
    readonly config: ConnectionConfigWithoutSecrets<InternalConnectionConfig>;
}

export interface ExternalConnection extends ConnectionBase {
    readonly type: ExternalConnectOptions['type'];
    readonly config: ConnectionConfigWithoutSecrets<ExternalConnectionConfig>;
}

export type Connection = InternalConnection | ExternalConnection;

export type RouteOptions = {
    route: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
}


type KnownRouteName = typeof knownRouteNames[number];

export interface CommonConnectionConfig {
    version: {

        /**
         * The version of the hawki backend API the client is connected to.
         */
        hawki: string;
        /**
         * The version of the hawki client application.
         */
        client: string;
    };
    featureFlags: {
        /**
         * Defines if AI feature are enabled for group chats.
         * This does not affect private AI chats.
         */
        aiInGroups: boolean;
    }
    locale: {
        /**
         * The list of all available locale objects supported by the server.
         */
        available: LocaleRecord;
        /**
         * The preferred locale code of the user, as set in their profile settings.
         * If not set by the configuration, this will be used as locale for all requests.
         * Can be overridden by selecting a different locale in the client.
         */
        preferred: LocaleCode;
        /**
         * The default locale code of the server, as set in the server configuration.
         * This will be used as a fallback if the user's preferred locale is not available.
         * It is also used as the initial locale for unauthenticated users.
         */
        default: LocaleCode;
    }
    ai: {
        /**
         * The AI mention handle which can be used to trigger AI responses in chats.
         * For example, if the handle is "@hawki", mentioning "@hawki" in a chat message will prompt an AI response.
         */
        handle: string;
        /**
         * The list of default AI models configured for the corresponding usage types.
         */
        defaultModels: Record<DefaultModelType, string>;
        /**
         * The list of system AI models configured for specific tasks like title generation, prompt improvement, and summarization.
         */
        systemModels: Record<SystemModelType, string>;
    },
    /**
     * Salts are used for key derivation and encryption purposes.
     */
    salts: {
        ai: ServerSalt;
        backup: ServerSalt;
        invitation: ServerSalt;
        userdata: ServerSalt;
        passkey: ServerSalt;
    },
    /**
     * Basic information about the connected user.
     */
    userinfo: {
        /**
         * The unique identifier of the user. This matches on the `id` field of the user object returned by the API.
         */
        id: number;
        username: string;
        email: string;
        /**
         * A hash derived by the user id and public key, which can be used to detect if
         * the user profile has been reset on the server. If this hash changes,
         * we must drop all local data, as it is no longer valid.
         */
        hash: string;
    },
    storage: {
        /**
         * Allowed MIME types for avatars
         */
        allowedAvatarMimeTypes: string[];
        /**
         * Allowed MIME types for file uploads (attachments)
         */
        allowedMimeTypes: string[];
        /**
         * Maximum number of attachment files per message
         */
        maxAttachmentFiles: number;
        /**
         * Maximum avatar file size in bytes
         */
        maxAvatarFileSize: number;
        /**
         * Maximum file uploads (attachments) file size in bytes
         */
        maxFileSize: number;
    },
    transfer: {
        /**
         * The base URL for API requests. All API endpoints are relative to this URL.
         */
        baseUrl: string;
        /**
         * A list of all known API routes and their paths.
         * We need to different paths for external apps and the internal frontend, because
         * the external apps use another authentication method and middlewares, through the laravel api.
         */
        routes: Record<KnownRouteName, RouteOptions>,
        /**
         * The configuration for the echo/pusher websocket connection.
         */
        websocket: {
            key: string;
            host: string;
            port: number;
            forceTLS: boolean;
        }
    }
}

export interface InternalConnectionConfig extends CommonConnectionConfig {
    type: InternalConnectOptions['type'];

    secrets: {
        /**
         * The CSRF token is used for authenticating API requests and should be kept secret.
         */
        csrfToken: string;
    };
}

export interface ExternalConnectionConfig extends CommonConnectionConfig {
    type: ExternalConnectOptions['type'];

    /**
     * Defines if the external application is already connected to a hawki user, or if a connection request needs to be made.
     */
    connectionType: 'connected';

    secrets: {
        /**
         * The passkey is used for deriving encryption keys and should be kept secret.
         */
        passkey: string;
        /**
         * The API token is used for authenticating API requests and should be kept secret.
         */
        apiToken: string;
    };
}

export type ConnectionConfig = InternalConnectionConfig | ExternalConnectionConfig;

export type ConnectionConfigWithoutSecrets<T extends CommonConnectionConfig> = Omit<T, 'secrets'>;

export type Userinfo = ConnectionConfig['userinfo'];
export type TransferRoutes = ConnectionConfig['transfer']['routes'];
export type TransferRoute = keyof TransferRoutes | string;

export interface CommonConnectOptions {
    /**
     * Defines if the connection is for an internal (HAWKI frontend) or external (third-party) application.
     */
    type: 'internal' | 'external';
    /**
     * A locale to use for the connection. If not provided, we try to select it based on the user's preferred locale
     * or the server's default locale. Can later be changed by using the `client.translation.setLocale` method.
     * Should have the format "de_DE", "en_US", etc.
     */
    locale?: LocaleCode;
}

export interface ProvidePasskeyHelpers {
    /**
     * This function can be used to validate if the provided passkey is correct.
     * It will attempt to decrypt the user's keychain using the provided passkey.
     * If the decryption is successful, the passkey is valid and the function returns true; in this case
     * you can return the passkey from your `providePasskey` function.
     *
     * If the decryption fails, the passkey is invalid and the function returns false; in this case
     * you should prompt the user to enter their passkey again; or ask them for their backup hash
     * and use the `backupHashToKey` function to retrieve their passkey from the server.
     */
    validatePasskey: (passKey: string) => Promise<boolean>,

    /**
     * Validates if the provided backup hash is in the correct format.
     * The backup hash looks something like this: `08be-58a6-c32f-7c8f`.
     * This function ONLY validates the format - it does NOT check if the hash is correct.
     * Use the `backupHashToKey` function to retrieve the passkey from the server using the backup hash.
     * @param hash
     */
    validateBackupHashFormat: (hash: string) => boolean,

    /**
     * Sends a fetch request to the server to retrieve the encrypted passkey using the provided backup hash.
     * If the backup hash is correct, the server will return the encrypted passkey which can be decrypted
     * using a key derived from the backup hash. If the backup hash is incorrect, the server will return null.
     * If no backup passkey is available on the server, null will also be returned.
     *
     * If a valid encrypted passkey is returned, you can simply return it from your `providePasskey` function.
     * If null is returned, you should prompt the user to enter their backup hash again; or ask if they
     * want to reset their account, which will delete all their data on the server.
     *
     * @param hash
     */
    backupHashToKey: (hash: string) => Promise<string | null>,

    /**
     * Basic information about the connected user.
     * This has been provided in the connection config and can be used to
     * display the username or email in your passkey prompt UI.
     */
    userinfo: Userinfo,

    /**
     * Salts are used for key derivation and encryption purposes. They have been provided in the connection config
     * and can be used when deriving keys from the passkey or backup hash.
     */
    salts: CommonConnectionConfig['salts']
}

export interface InternalConnectOptions extends CommonConnectOptions {
    /**
     * Use this connection type to create a connection for the internal HAWKI frontend application.
     *
     * As a rule of thumb, if you are building a third-party application, you should use the 'external' connection type instead.
     */
    type: 'internal';

    /**
     * This function is responsible for resolving the user's passkey.
     * The passkey is the main secret used for decrypting the keychain and other sensitive data.
     * This function will be called until a valid passkey is returned, so it can be used to prompt the user for their passkey;
     * for better user experience, you should create a dynamic form using the provided helpers instead.
     */
    providePasskey: (helpers: ProvidePasskeyHelpers) => string | Promise<string>;

    /**
     * In the HAWKI frontend, the connection will normally be provided by the `<x-internal-frontend-connection/>` component,
     * that will render a <script> tag with the id "frontend-connection" containing the connection data as JSON.
     * If you are not using this component, you can provide a different selector to load the connection data from.
     * The selector must point to a <script> tag containing the connection data as JSON.
     * If not provided, the default selector "#frontend-connection" will be used.
     */
    connectionSelector?: string;
}

export interface ExternalConnectOptions extends CommonConnectOptions {
    /**
     * Use this connection type to create a connection for a third-party application.
     *
     * Note: when you are building a third-party application, you MUST enable the "external_apps" feature in your HAWKI
     * installation. Also, you MUST use a dedicated server backend to authenticate your app. This backend
     * will contain your apps secret keys and will be responsible for proxying the connection request to the hawki server.
     */
    type: 'external';

    /**
     * Defines the url of your third-party app's server backend, where the connection request will be sent to.
     * The backend will receive a post request with the client's public key, and it will be responsible for
     * creating a connection request on the hawki server using the hawki API.
     * The backend will then return the connection request url to the client, which will be used to complete the connection.
     *
     * If you do not provide this option, you MUST provide the `loadClientConfig` function instead.
     * This function will be called with the client's public key, and it must return a promise that resolves
     * to an object containing the `hawkiClientConfig` property with the client configuration as JSON string.
     *
     * Note: if both `clientConfigUrl` and `loadClientConfig` are provided, the `clientConfigUrl` will be used.
     *
     * Take a look at the GitHub repo, where you can find the libraries to create a backend.
     */
    clientConfigUrl?: string;

    /**
     * This function is responsible for loading the client configuration from your third-party app's server backend.
     * The function will be called with the client's public key, and it must return a promise that resolves
     * to an object containing the `hawkiClientConfig` property with the client configuration as JSON string.
     *
     * If you do not provide this option, you MUST provide the `clientConfigUrl` option instead.
     *
     * Note: if both `clientConfigUrl` and `loadClientConfig` are provided, the `clientConfigUrl` will be used.
     * @param publicKey
     */
    loadClientConfig?: (publicKey: string) => Promise<{ hawkiClientConfig: string }>;

    /**
     * When you are trying to connect an external app to a HAWKI server, HAWKI must first map
     * the user of your third-party app to a HAWKI user. This is done by creating a connection request
     * on the HAWKI server, which generates a unique URL that the user must open in their browser
     * to approve the connection request and link their HAWKI account to your app.
     *
     * This function will be called with the connection request URL, and it is your responsibility
     * to prompt the user to open this URL in their browser. You can display a QR code for mobile users,
     * or simply show the URL as a clickable link. Once the user has approved the connection request,
     * the connection will be established automatically.
     *
     * Note: if you are building a web application, you can also simply redirect the user to this URL.
     * However, this is not recommended for mobile apps, where you should display a QR code instead.
     *
     * Note2: This function will be called in a loop, trying to connect over and over again, until the user
     * has approved the connection request. Therefore, you should ensure that your implementation
     * returns a blocking promise that only resolves once you are sure that the user has seen the connection request URL.
     *
     * @param connectUrl
     */
    onConnectionRequired: (connectUrl: string) => Promise<void>;
}
