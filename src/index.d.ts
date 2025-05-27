/**
 * Type definitions for the HAWKI Chat Client
 */

declare module 'hawki-chat-client' {
  /**
   * WebSocket configuration options
   */
  export interface WSConfig {
    key?: string;
    wsHost?: string;
    wsPort?: number;
    wssPort?: number;
    forceTLS?: boolean;
    [key: string]: any;
  }

  /**
   * Room creation request data
   */
  export interface RoomRequestData {
    name: string;
    description?: string;
    systemPrompt?: string;
    avatarUrl?: string;
    invitedMembers?: Array<any>;
  }

  /**
   * Room attributes for updates
   */
  export interface RoomAttributes {
    systemPrompt?: string;
    description?: string;
    name?: string;
    img?: string;
  }

  /**
   * Room data structure
   */
  export interface Room {
    id: number;
    slug: string;
    name: string;
    [key: string]: any;
  }

  /**
   * Main HAWKI Chat class
   */
  export default class HAWKIChat {
    /**
     * Creates a new HAWKI Chat instance
     * @param apiUrl - Base URL for the HAWKI API
     * @param wsConfig - Optional WebSocket configuration
     */
    constructor(apiUrl: string, wsConfig?: WSConfig);

    /**
     * Initializes the chat client with user authentication and room setup
     * @param userToken - Authentication token for API requests
     * @returns Success status
     */
    init(userToken: string): Promise<boolean>;

    /**
     * Subscribes to WebSocket channels for multiple rooms
     * @param roomsList - List of room objects
     * @param onMessageCallback - Callback for handling WebSocket messages
     */
    subscribeToRooms(roomsList: Array<Room>, onMessageCallback: Function): void;

    /**
     * Subscribes to a WebSocket channel for a specific room
     * @param roomSlug - Unique identifier for the room
     * @param callback - Optional callback for handling WebSocket messages
     */
    subscribeToRoom(roomSlug: string, callback?: Function): void;

    /**
     * Retrieves the list of rooms the user belongs to
     * @returns List of room objects
     */
    getRoomsList(): Promise<Array<Room>>;

    /**
     * Retrieves and decrypts the content of a specific room
     * @param roomSlug - Unique identifier for the room
     * @returns Decrypted room data including messages
     */
    getRoomContent(roomSlug: string): Promise<any>;

    /**
     * Creates a new encrypted chat room
     * @param requestData - Room creation data
     * @returns Newly created room data
     */
    createRoom(requestData: RoomRequestData): Promise<any>;

    /**
     * Updates room information
     * @param slug - Unique identifier for the room
     * @param attributes - Room attributes to update
     * @returns Updated room data
     */
    updateRoomInfo(slug: string, attributes: RoomAttributes): Promise<any>;

    /**
     * Deletes a room
     * @param slug - Unique identifier for the room
     * @returns Success status
     */
    deleteRoom(slug: string): Promise<boolean>;

    /**
     * Leaves a room
     * @param slug - Unique identifier for the room
     * @returns Success status
     */
    leaveRoom(slug: string): Promise<boolean>;

    /**
     * Removes a member from a room
     * @param slug - Unique identifier for the room
     * @param username - Username of the member to remove
     * @returns Success status
     */
    kickMember(slug: string, username: string): Promise<boolean>;

    /**
     * Submits an encrypted message to a room
     * @param inputText - Message text to encrypt and send
     * @param threadNumber - Thread ID to post the message to
     * @param roomSlug - Unique identifier for the room
     * @returns Sent message data
     */
    submitMessage(inputText: string, threadNumber: number, roomSlug: string): Promise<any>;

    /**
     * Searches for users by query
     * @param query - Search query (minimum 4 characters)
     * @returns List of matching users
     */
    searchUser(query: string): Promise<Array<any>>;

    /**
     * Sends invitations to users to join a room
     * @param listOfInvitees - List of users to invite
     * @param slug - Unique identifier for the room
     */
    sendInvitations(listOfInvitees: Array<any>, slug: string): Promise<void>;

    /**
     * Retrieves and processes invitations for the current user
     * @param onBroadcasterCallback - Callback for WebSocket updates
     * @returns Room data if invitation is accepted
     */
    getUserInvitations(onBroadcasterCallback: Function): Promise<any>;
    
    /**
     * Verifies a user's passkey
     * @param passkey - Passkey to verify
     * @param keychainData - Encrypted keychain data
     * @param onSuccess - Success callback
     * @param onError - Error callback
     * @returns Verification result
     */
    verifyPasskey(
      passkey: string, 
      keychainData: string, 
      onSuccess?: Function, 
      onError?: Function
    ): Promise<any>;
    
    /**
     * Extracts a passkey from backup hash
     * @param backupHash - Backup hash
     * @param userInfo - User information
     * @param onSuccess - Success callback
     * @param onError - Error callback
     * @returns Extraction result
     */
    recoverPasskey(
      backupHash: string, 
      userInfo: any, 
      onSuccess?: Function, 
      onError?: Function
    ): Promise<any>;
    
    /**
     * Uploads a backup file
     * @param onFileLoaded - Callback when file is loaded
     * @param onError - Callback on error
     */
    uploadBackupFile(onFileLoaded: Function, onError?: Function): void;
    
    /**
     * Resets a user profile
     * @returns Redirect URL
     */
    resetProfile(): Promise<string>;
    
    /**
     * Cleans up user data
     * @param username - Username
     * @param callback - Callback function
     */
    cleanup(username?: string, callback?: Function): Promise<void>;
  }
}