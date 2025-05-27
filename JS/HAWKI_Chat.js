/**
 * HAWKI_Chat - End-to-end encrypted chat client for HAWKI server
 * 
 * This module provides secure communication with the HAWKI server,
 * handling encrypted messaging, room management, and user authentication.
 */

import * as Utils from './utils/utils';
import * as Crypt from './utils/encryption';
import * as Handshake from './utils/handshake_functions';

/**
 * Main class for HAWKI chat operations with end-to-end encryption
 */
class HAWKI_Chat {
    /**
     * @type {string} Authentication token for API requests
     * @private
     */
    #userToken;
    
    /**
     * @type {string} Base URL for the HAWKI API
     * @private
     */
    #hawkiUrl;
    
    /**
     * @type {Array} List of rooms the user belongs to
     * @private
     */
    #roomsList = [];

    /**
     * Creates a new HAWKI_Chat instance
     * @param {string} apiUrl - Base URL for the HAWKI API
     */
    constructor(apiUrl) {
        if (!apiUrl) {
            throw new Error('API URL is required');
        }
        this.#hawkiUrl = apiUrl;
    }

    /**
     * Initializes the chat client with user authentication and room setup
     * @param {string} userToken - Authentication token for API requests
     * @returns {Promise<void>}
     * @throws {Error} If initialization fails
     */
    async init(userToken) {
        if (!userToken) {
            throw new Error('User token is required');
        }
        
        this.#userToken = userToken;
        
        try {
            // Initialize user rooms
            this.#roomsList = await this.getRoomsList();
            
            // Subscribe to WebSocket channels for all rooms
            this.#roomsList.forEach(room => {
                this.subscribeToRoomWSChannel(room.slug);
            });
            
            return true;
        } catch (error) {
            console.error('Failed to initialize HAWKI_Chat:', error);
            throw new Error('Failed to initialize HAWKI_Chat');
        }
    }

    /**
     * Subscribes to WebSocket channels for multiple rooms
     * @param {Array} roomsList - List of room objects
     * @param {Function} onBroadcasterCallback - Callback for handling WebSocket messages
     */
    subscribeToRoomBroadcaster(roomsList, onBroadcasterCallback) {
        if (!roomsList || !Array.isArray(roomsList)) {
            throw new Error('roomsList must be an array');
        }
        
        roomsList.forEach(room => {
            Utils.connectWebSocket(room.slug, onBroadcasterCallback);
        });
    }

    /**
     * Subscribes to a WebSocket channel for a specific room
     * @param {string} roomSlug - Unique identifier for the room
     * @param {Function} callback - Optional callback for handling WebSocket messages
     */
    subscribeToRoomWSChannel(roomSlug, callback) {
        if (!roomSlug) {
            throw new Error('Room slug is required');
        }
        
        Utils.connectWebSocket(roomSlug, callback);
    }

    //#region ROOM CONTROLS
    
    /**
     * Retrieves the list of rooms the user belongs to
     * @returns {Promise<Array>} List of room objects
     */
    async getRoomsList() {
        const url = `${this.#hawkiUrl}/user/rooms`;
        const data = await Utils.fetchData(url, this.#userToken);
        
        if (!data || !data.rooms) {
            throw new Error('Failed to retrieve rooms list');
        }
        
        return data.rooms;
    }

    /**
     * Retrieves and decrypts the content of a specific room
     * @param {string} roomSlug - Unique identifier for the room
     * @returns {Promise<Object>} Decrypted room data including messages
     */
    async getRoomContent(roomSlug) {
        if (!roomSlug) {
            throw new Error('Room slug is required');
        }
        
        try {
            const fetchRoomContentUrl = `${this.#hawkiUrl}/req/room/${roomSlug}`;
            const roomData = await Utils.fetchData(fetchRoomContentUrl, this.#userToken);

            // Get encryption keys
            const roomKey = await Crypt.keychainGet(roomSlug);
            const aiCryptoSalt = await Crypt.fetchServerSalt('AI_CRYPTO_SALT');
            const aiKey = await Crypt.deriveKey(roomKey, roomSlug, aiCryptoSalt);
        
            // Decrypt room description if present
            if (roomData.room_description) {
                const descriptObj = JSON.parse(roomData.room_description);
                roomData.room_description = await Crypt.decryptWithSymKey(
                    roomKey, 
                    descriptObj.ciphertext, 
                    descriptObj.iv, 
                    descriptObj.tag, 
                    false
                );
            }
            
            // Decrypt system prompt if present
            if (roomData.system_prompt) {
                const systemPromptObj = JSON.parse(roomData.system_prompt);
                roomData.system_prompt = await Crypt.decryptWithSymKey(
                    roomKey, 
                    systemPromptObj.ciphertext, 
                    systemPromptObj.iv, 
                    systemPromptObj.tag, 
                    false
                );
            }

            // Decrypt all messages
            let decryptedMsgs = [];
            for (const msgData of roomData.messagesData) {
                // Use AI key for assistant messages, room key for user messages
                const key = msgData.message_role === 'assistant' ? aiKey : roomKey;
                msgData.content = await Crypt.decryptWithSymKey(
                    key, 
                    msgData.content, 
                    msgData.iv, 
                    msgData.tag, 
                    false
                );
                decryptedMsgs.push(msgData);
            }
            roomData.messagesData = decryptedMsgs;

            return roomData;
        } catch (error) {
            console.error(`Failed to get room content for ${roomSlug}:`, error);
            throw new Error(`Failed to get room content: ${error.message}`);
        }
    }

    /**
     * Creates a new encrypted chat room
     * @param {Object} requestData - Room creation data
     * @param {string} requestData.name - Name of the room
     * @param {string} requestData.description - Description of the room
     * @param {string} requestData.systemPrompt - System prompt for AI
     * @param {string} requestData.avatarUrl - URL for room avatar
     * @param {Array} requestData.invitedMembers - List of users to invite
     * @returns {Promise<Object>} Newly created room data
     */
    async submitNewRoom(requestData) {
        if (!requestData || !requestData.name) {
            throw new Error('Room name is required');
        }
        
        try {
            // Create room on server
            const url = `${this.#hawkiUrl}/req/room/createRoom`;
            const requestObj = {
                'room_name': requestData.name,
            };
            const roomData = await Utils.postData(url, this.#userToken, requestObj);
                    
            // Generate encryption key for the room
            const roomKey = await Crypt.generateKey();
            await Crypt.keychainSet(roomData.slug, roomKey, true);

            // Encrypt room description if provided
            let descriptionStr = '';
            if (requestData.description) {
                const cryptDescription = await Crypt.encryptWithSymKey(roomKey, requestData.description, false);
                descriptionStr = JSON.stringify({
                    'ciphertext': cryptDescription.ciphertext,
                    'iv': cryptDescription.iv,
                    'tag': cryptDescription.tag,
                });
            }
            
            // Encrypt system prompt if provided
            let systemPromptStr = '';
            if (requestData.systemPrompt) {
                const cryptSystemPrompt = await Crypt.encryptWithSymKey(roomKey, requestData.systemPrompt, false);
                systemPromptStr = JSON.stringify({
                    'ciphertext': cryptSystemPrompt.ciphertext,
                    'iv': cryptSystemPrompt.iv,
                    'tag': cryptSystemPrompt.tag,
                });
            }

            // Prepare attributes for room update
            const roomAttributes = {};
            if (systemPromptStr) roomAttributes.systemPrompt = systemPromptStr;
            if (descriptionStr) roomAttributes.description = descriptionStr;
            if (requestData.avatarUrl) roomAttributes.img = requestData.avatarUrl;
            
            // Update room info with encrypted data
            await this.updateRoomInfo(roomData.slug, roomAttributes);

            // Create and send invitations to members if provided
            if (requestData.invitedMembers && requestData.invitedMembers.length > 0) {
                await Utils.createAndSendInvitations(requestData.invitedMembers, roomData.slug);
            }

            return roomData;
        } catch (error) {
            console.error('Failed to create room:', error);
            throw new Error(`Failed to create room: ${error.message}`);
        }
    }

    /**
     * Updates room information
     * @param {string} slug - Unique identifier for the room
     * @param {Object} attributes - Room attributes to update
     * @param {string} [attributes.systemPrompt] - Encrypted system prompt
     * @param {string} [attributes.description] - Encrypted room description
     * @param {string} [attributes.name] - Room name
     * @param {string} [attributes.img] - Room avatar URL
     * @returns {Promise<Object>} Updated room data
     */
    async updateRoomInfo(slug, attributes) {
        if (!slug) {
            throw new Error('Room slug is required');
        }
        
        const url = `${this.#hawkiUrl}/req/room/updateInfo/${slug}`; 

        let requestObj = {};
        if (attributes.systemPrompt) requestObj.system_prompt = attributes.systemPrompt;
        if (attributes.description) requestObj.description = attributes.description;
        if (attributes.name) requestObj.name = attributes.name;
        if (attributes.img) requestObj.img = attributes.img;

        try {
            return await Utils.postData(url, this.#userToken, requestObj);
        } catch (error) {
            console.error(`Failed to update room ${slug}:`, error);
            throw error;
        }
    }

    /**
     * Deletes a room
     * @param {string} slug - Unique identifier for the room
     * @returns {Promise<boolean>} Success status
     */
    async deleteRoom(slug) {
        if (!slug) {
            throw new Error('Room slug is required');
        }
        
        const url = `${this.#hawkiUrl}/req/room/removeRoom/${slug}`;
        try {
            const success = await Utils.requestDelete(url, this.#userToken);
            return success;
        } catch (error) {
            console.error(`Failed to delete room ${slug}:`, error);
            throw error;
        }
    }
    
    /**
     * Leaves a room
     * @param {string} slug - Unique identifier for the room
     * @returns {Promise<boolean>} Success status
     */
    async leaveRoom(slug) {
        if (!slug) {
            throw new Error('Room slug is required');
        }
        
        const url = `${this.#hawkiUrl}/req/room/leaveRoom/${slug}`;
        try {
            const success = await Utils.requestDelete(url, this.#userToken);
            return success;
        } catch (error) {
            console.error(`Failed to leave room ${slug}:`, error);
            throw error;
        }
    }

    /**
     * Removes a member from a room
     * @param {string} slug - Unique identifier for the room
     * @param {string} username - Username of the member to remove
     * @returns {Promise<boolean>} Success status
     */
    async kickMember(slug, username) {
        if (!slug || !username) {
            throw new Error('Room slug and username are required');
        }
        
        const url = `${this.#hawkiUrl}/req/room/leaveRoom/${slug}`;
        try {
            const success = await Utils.requestDelete(url, this.#userToken, username);
            return success;
        } catch (error) {
            console.error(`Failed to remove ${username} from room ${slug}:`, error);
            throw error;
        }
    }
    //#endregion

    //#region MESSAGE CONTROLS
    /**
     * Submits an encrypted message to a room
     * @param {string} inputText - Message text to encrypt and send
     * @param {number} threadNumber - Thread ID to post the message to
     * @param {string} roomSlug - Unique identifier for the room
     * @returns {Promise<Object>} Sent message data
     */
    async submitMessage(inputText, threadNumber, roomSlug) {
        if (!inputText || !roomSlug) {
            throw new Error('Message text and room slug are required');
        }
        
        try {
            return await Utils.onSubmitMessageToServer(
                inputText, 
                threadNumber, 
                roomSlug, 
                this.#userToken
            );
        } catch (error) {
            console.error('Failed to submit message:', error);
            throw error;
        }
    }
    //#endregion
    
    //#region SEARCH
    /**
     * Searches for users by query
     * @param {string} query - Search query (minimum 4 characters)
     * @returns {Promise<Array>} List of matching users
     */
    async searchUser(query) {
        if (!query || query.length < 4) {
            throw new Error('Search query must be at least 4 characters');
        }
        
        try {
            return await Utils.onSearchUser(query);
        } catch (error) {
            console.error('Failed to search users:', error);
            throw error;
        }
    }
    //#endregion

    //#region INVITATIONS
    /**
     * Sends invitations to users to join a room
     * @param {Array} listOfInvitees - List of users to invite
     * @param {string} slug - Unique identifier for the room
     * @returns {Promise<void>}
     */
    async sendInvitations(listOfInvitees, slug) {
        if (!listOfInvitees || !Array.isArray(listOfInvitees) || !slug) {
            throw new Error('List of invitees and room slug are required');
        }
        
        try {
            await Utils.createAndSendInvitations(listOfInvitees, slug);
        } catch (error) {
            console.error('Failed to send invitations:', error);
            throw error;
        }
    }

    /**
     * Retrieves and processes invitations for the current user
     * @param {Function} onBroadcasterCallback - Callback for WebSocket updates
     * @returns {Promise<void>}
     */
    async getUserInvitations(onBroadcasterCallback) {
        try {
            const url = `${this.#hawkiUrl}/req/inv/requestUserInvitations`;
            const invData = await Utils.fetchData(url, this.#userToken);
            
            if (!invData || !invData.formattedInvitations) {
                return [];
            }
            
            const formattedInvitations = invData.formattedInvitations;

            try {
                const roomKey = await Utils.handleUserInvitations(formattedInvitations);
                if (roomKey) {
                    const acceptUrl = `${this.#hawkiUrl}/req/inv/roomInvitationAccept`;
                    const roomData = await Utils.acceptInvitation(
                        formattedInvitations[0].invitation_id, 
                        roomKey, 
                        acceptUrl
                    );
                    
                    Utils.connectWebSocket(roomData.slug, onBroadcasterCallback);
                    return roomData;
                } else {
                    throw new Error('Bad Invitation Format');
                }
            } catch (error) {
                console.error('Error processing invitation:', error);
                throw error;
            }
        } catch (error) {
            console.error('Failed to get user invitations:', error);
            throw error;
        }
    }
    //#endregion
}

export default HAWKI_Chat;