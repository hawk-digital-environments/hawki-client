/**
 * HAWKI Utility Module
 * 
 * Provides utility functions for HAWKI chat application including:
 * - Server communication
 * - WebSocket management
 * - Message operations
 * - User search functionality
 * - Invitation management
 */

import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { keychainGet, encryptWithSymKey, fetchServerSalt, deriveKey, exportSymmetricKey, 
         arrayBufferToBase64, base64ToArrayBuffer, decryptWithPrivateKey, 
         encryptWithPublicKey, encryptWithTempHash, generateTempHash } from './encryption';

/**
 * Initialize Echo for WebSocket communication
 */
window.Pusher = Pusher;

window.Echo = new Echo({
    broadcaster: 'reverb',
    key: import.meta.env.VITE_REVERB_APP_KEY ?? 'hawki2',
    wsHost: import.meta.env.VITE_REVERB_HOST ?? window.location.hostname,
    wsPort: import.meta.env.VITE_REVERB_PORT ?? 80,
    wssPort: import.meta.env.VITE_REVERB_PORT ?? 443,
    forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
    enabledTransports: ['ws', 'wss'],
});

//#region SERVER COMMUNICATION

/**
 * Fetches data from the server
 * @param {string} url - API endpoint URL
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Response data
 * @throws {Error} If the request fails
 */
export async function fetchData(url, token) {
    if (!url) {
        throw new Error('URL is required for fetch operation');
    }
    
    if (!token) {
        throw new Error('Authentication token is required for fetch operation');
    }

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `bearer ${token}`
            },
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server Error:', errorData.error || 'Unknown error');
            throw new Error(`Server Error: ${errorData.error || response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error('Operation failed: ' + (data.message || 'No details provided'));
        }
        
        return data;
    } catch (error) {
        console.error('Failed to fetch data:', error);
        throw error;
    }
}

/**
 * Posts data to the server
 * @param {string} url - API endpoint URL
 * @param {string} token - Authentication token
 * @param {Object} reqData - Request data to send
 * @returns {Promise<Object>} Response data
 * @throws {Error} If the request fails
 */
export async function postData(url, token, reqData) {
    if (!url) {
        throw new Error('URL is required for post operation');
    }
    
    if (!token) {
        throw new Error('Authentication token is required for post operation');
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `bearer ${token}`
            },
            body: JSON.stringify({reqData})
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server Error:', errorData.error || 'Unknown error');
            throw new Error(`Server Error: ${errorData.error || response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error('Operation failed: ' + (data.message || 'No details provided'));
        }
        
        return data;
    } catch (error) {
        console.error('Failed to post data:', error);
        throw error;
    }
}

/**
 * Sends a DELETE request to the server
 * @param {string} url - API endpoint URL
 * @param {string} token - Authentication token
 * @param {Object} [body] - Optional request body
 * @returns {Promise<boolean>} Success status
 * @throws {Error} If the request fails
 */
export async function requestDelete(url, token, body = null) {
    if (!url) {
        throw new Error('URL is required for delete operation');
    }
    
    if (!token) {
        throw new Error('Authentication token is required for delete operation');
    }

    try {
        const requestOptions = {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `bearer ${token}`
            }
        };
        
        if (body) {
            requestOptions.body = JSON.stringify(body);
        }
        
        const response = await fetch(url, requestOptions);
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server Error:', errorData.error || 'Unknown error');
            throw new Error(`Server Error: ${errorData.error || response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error('Delete operation failed: ' + (data.message || 'No details provided'));
        }
        
        return data.success;
    } catch (error) {
        console.error('Failed to send delete request:', error);
        throw error;
    }
}

/**
 * Connects to a WebSocket channel for a room
 * @param {string} roomSlug - Room identifier
 * @param {Function} onBroadcasterCallback - Callback for incoming messages
 */
export function connectWebSocket(roomSlug, onBroadcasterCallback) {
    if (!roomSlug) {
        throw new Error('Room slug is required for WebSocket connection');
    }

    const webSocketChannel = `Rooms.${roomSlug}`;

    try {
        window.Echo.private(webSocketChannel)
            .listen('RoomMessageEvent', async (e) => {
                try {
                    // Decompress the data received from server
                    const compressedData = atob(e.data); // Base64 decode
                    const binaryData = new Uint8Array(compressedData.split("").map(c => c.charCodeAt(0))); // Convert to Uint8Array
                    
                    // Using pako for decompression (ensure pako is imported)
                    if (typeof pako === 'undefined') {
                        throw new Error('Pako library is not available for decompression');
                    }
                    
                    const jsonString = pako.ungzip(binaryData, { to: "string" }); // Decompress Gzip
                    const data = JSON.parse(jsonString); // Parse JSON data

                    // Call the callback with data if provided
                    if (onBroadcasterCallback && typeof onBroadcasterCallback === 'function') {
                        onBroadcasterCallback(data);
                    }
                } catch (error) {
                    console.error("Failed to process WebSocket message:", error);
                }
            });
    } catch (error) {
        console.error("Failed to connect to WebSocket:", error);
        throw new Error(`WebSocket connection failed: ${error.message}`);
    }
}
//#endregion

//#region SEARCH
/**
 * Searches for users by query
 * @param {string} query - Search query (minimum 4 characters)
 * @param {string} hawkiUrl - API base URL
 * @returns {Promise<Array>} Search results
 * @throws {Error} If search fails or query is too short
 */
export async function onSearchUser(query, hawkiUrl) {
    if (!hawkiUrl) {
        throw new Error('HAWKI URL is required for user search');
    }
    
    if (!query || query.length < 4) {
        return [];
    }
    
    try {
        const response = await fetch(`${hawkiUrl}/req/search?query=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server Error:', errorData.error || 'Unknown error');
            throw new Error(`Server Error: ${errorData.error || response.statusText}`);
        }
        
        const data = await response.json();
        
        if (data.success && Array.isArray(data.users)) {
            return data.users;
        } else {
            return [];
        }
    } catch (error) {
        console.error('Search operation failed:', error);
        return [];
    }
}
//#endregion

//#region MESSAGE
/**
 * Sanitizes HTML to prevent XSS attacks
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 * @private
 */
function escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Submits an encrypted message to the server
 * @param {string} inputText - Message text
 * @param {number} threadID - Thread identifier
 * @param {string} roomSlug - Room identifier
 * @param {string} userToken - Authentication token
 * @param {string} hawkiUrl - API base URL
 * @returns {Promise<Object>} Message data
 * @throws {Error} If message submission fails
 */
export async function onSubmitMessageToServer(inputText, threadID, roomSlug, userToken, hawkiUrl) {
    if (!inputText || !roomSlug || !userToken || !hawkiUrl) {
        throw new Error('Missing required parameters for message submission');
    }

    // Sanitize input to prevent XSS
    const sanitizedText = escapeHTML(inputText.trim());
    
    try {
        // Get room key from keychain
        const roomKey = await keychainGet(roomSlug);
        if (!roomKey) {
            throw new Error(`Room key not found for ${roomSlug}`);
        }
        
        // Encrypt message with room key
        const encryptedData = await encryptWithSymKey(roomKey, sanitizedText, false);
        
        // Prepare message object for sending
        const messageObj = {
            content: encryptedData.ciphertext,
            iv: encryptedData.iv,
            tag: encryptedData.tag,
            threadID: threadID,
        };

        // Send message to server
        const url = `${hawkiUrl}/req/room/sendMessage/${roomSlug}`;
        const serverData = await postData(url, userToken, messageObj);
        
        if (!serverData.messageData) {
            throw new Error('No message data returned from server');
        }
        
        // Add decrypted content to response data
        const msgData = serverData.messageData;
        msgData.content = sanitizedText;
        
        return msgData;
    } catch (error) {
        console.error('Failed to submit message:', error);
        throw error;
    }
}

/**
 * Detects user and AI mentions in a message
 * @param {string} rawText - Message text
 * @param {string} aiHandle - AI handle to check for
 * @returns {Object} Object with mention information
 */
export function detectMentioning(rawText, aiHandle) {
    if (!rawText) {
        return {
            aiMentioned: false,
            filteredText: '',
            modifiedText: '',
            aiMention: '',
            userMentions: []
        };
    }
    
    if (!aiHandle) {
        aiHandle = '@ai'; // Default AI handle if not provided
    }

    const returnObj = {
        aiMentioned: false,
        filteredText: rawText,
        modifiedText: rawText,
        aiMention: '',
        userMentions: []
    };

    const mentionRegex = /@\w+/g;
    const mentionMatches = rawText.match(mentionRegex);

    if (mentionMatches) {
        let processedText = rawText;
        
        for (const mention of mentionMatches) {
            if (mention.toLowerCase() === aiHandle.toLowerCase()) {
                returnObj.aiMentioned = true;
                returnObj.aiMention = mention;
                processedText = processedText.replace(new RegExp(mention, 'i'), '').trim();
            } else {
                returnObj.userMentions.push(mention.substring(1)); // Remove the '@' for other mentions
            }
        }
        
        returnObj.filteredText = processedText;
        returnObj.modifiedText = rawText.replace(mentionRegex, (match) => `<b>${match.toLowerCase()}</b>`);
    }
    
    return returnObj;
}

/**
 * Builds an AI request object with encryption
 * @param {string} roomSlug - Room identifier
 * @param {number} threadIndex - Thread identifier
 * @param {CryptoKey} roomKey - Room encryption key
 * @returns {Promise<Object>} AI request attributes
 */
export async function buildAiRequestObject(roomSlug, threadIndex, roomKey) {
    if (!roomSlug || threadIndex === undefined || !roomKey) {
        throw new Error('Missing required parameters for AI request');
    }
    
    try {
        // Create AI-specific encryption key
        const aiCryptoSalt = await fetchServerSalt('AI_CRYPTO_SALT');
        const aiKey = await deriveKey(roomKey, roomSlug, aiCryptoSalt);
        const aiKeyRaw = await exportSymmetricKey(aiKey);
        const aiKeyBase64 = arrayBufferToBase64(aiKeyRaw);

        // Prepare message attributes for AI
        return {
            'threadIndex': threadIndex,
            'broadcasting': true,
            'slug': roomSlug,
            'key': aiKeyBase64,
            'stream': false,
        };
    } catch (error) {
        console.error('Failed to build AI request object:', error);
        throw error;
    }
}
//#endregion

//#region INVITATION
/**
 * Create and send encrypted invitations to a list of users
 * @param {Array} usersList - List of user objects to invite
 * @param {string} roomSlug - Room slug to invite users to
 * @returns {Promise<void>}
 */
export async function createAndSendInvitations(usersList, roomSlug) {
    if (!usersList || !Array.isArray(usersList) || !roomSlug) {
        throw new Error('User list and room slug are required for invitations');
    }

    try {
        // Get the room encryption key
        const roomKey = await keychainGet(roomSlug);
        if (!roomKey) {
            throw new Error(`Room key not found for ${roomSlug}`);
        }
        
        const invitations = [];
        
        // Process each invitee
        for (const invitee of usersList) {
            if (!invitee || !invitee.username) {
                console.warn('Skipping invalid invitee:', invitee);
                continue;
            }
            
            let invitation;
            
            // For users with a public key, use asymmetric encryption
            if (invitee.publicKey) {
                // Encrypt room key with the user's public key
                const publicKeyBuffer = base64ToArrayBuffer(invitee.publicKey);
                const encryptedRoomKey = await encryptWithPublicKey(roomKey, publicKeyBuffer);
                
                invitation = {
                    username: invitee.username,
                    encryptedRoomKey: encryptedRoomKey.ciphertext,
                    iv: '0', // Not used for public key encryption
                    tag: '0', // Not used for public key encryption
                    role: invitee.role || 'member'
                };
            } else {
                // For external users without a public key, use temp hash method
                const tempHash = generateTempHash();
                const encryptedRoomKey = await encryptWithTempHash(roomKey, tempHash);

                invitation = {
                    username: invitee.username,
                    encryptedRoomKey: encryptedRoomKey.ciphertext,
                    iv: encryptedRoomKey.iv,
                    tag: encryptedRoomKey.tag,
                    role: invitee.role || 'member'
                };

                // Send email with invitation link containing temp hash
                const mailContent = {
                    username: invitee.username,
                    hash: tempHash,
                    slug: roomSlug
                };
                
                await sendInvitationEmail(mailContent);
            }
            
            invitations.push(invitation);
        }
        
        // Store all invitations on the server
        if (invitations.length > 0) {
            await requestStoreInvitationsOnServer(invitations, roomSlug);
        }
    } catch (error) {
        console.error('Failed to create and send invitations:', error);
        throw error;
    }
}

/**
 * Store invitations on the server database
 * @param {Array} invitations - List of invitation objects
 * @param {string} slug - Room slug
 * @returns {Promise<void>}
 * @private
 */
async function requestStoreInvitationsOnServer(invitations, slug) {
    if (!invitations || !Array.isArray(invitations) || !slug) {
        throw new Error('Invitations array and room slug are required');
    }

    try {
        const csrfToken = getCsrfToken();
        
        const response = await fetch(`/req/inv/store-invitations/${slug}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken
            },
            body: JSON.stringify({invitations})
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server Error:', errorData.error || 'Unknown error');
            throw new Error(`Server Error: ${errorData.error || response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error('Failed to store invitations: ' + (data.message || 'No details provided'));
        }
    } catch (error) {
        console.error('Failed to store invitations on server:', error);
        throw error;
    }
}

/**
 * Send invitation email to users without public keys
 * @param {Object} mailContent - Email content with username, hash, and slug
 * @returns {Promise<void>}
 * @private
 */
async function sendInvitationEmail(mailContent) {
    if (!mailContent || !mailContent.username || !mailContent.hash || !mailContent.slug) {
        throw new Error('Mail content must include username, hash, and slug');
    }

    try {
        const csrfToken = getCsrfToken();
        
        const response = await fetch(`/req/inv/sendExternInvitation`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken
            },
            body: JSON.stringify(mailContent)
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server Error:', errorData.error || 'Unknown error');
            throw new Error(`Server Error: ${errorData.error || response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success) {
            throw new Error('Failed to send invitation email: ' + (data.message || 'No details provided'));
        }
    } catch (error) {
        console.error('Failed to send invitation email:', error);
        throw error;
    }
}

/**
 * Handle invitations sent to the current user
 * @param {Array} invitations - List of invitation objects
 * @returns {Promise<CryptoKey|null>} Decrypted room key or null if failed
 */
export async function handleUserInvitations(invitations) {
    if (!invitations || !Array.isArray(invitations) || invitations.length === 0) {
        throw new Error('Invitations array is required and cannot be empty');
    }

    try {
        // Get user's private key from keychain
        const privateKeyBase64 = await keychainGet('privateKey');
        if (!privateKeyBase64) {
            throw new Error('Private key not found in keychain');
        }
        
        // Convert private key from Base64 to ArrayBuffer
        const privateKey = base64ToArrayBuffer(privateKeyBase64);

        // Process each invitation
        for (const inv of invitations) {
            try {
                if (!inv.invitation) {
                    console.warn('Invitation data missing for invitation ID:', inv.invitation_id);
                    continue;
                }
                
                // Decrypt room key using user's private key
                const encryptedRoomKeyBuffer = base64ToArrayBuffer(inv.invitation);
                const roomKey = await decryptWithPrivateKey(encryptedRoomKeyBuffer, privateKey);
                
                return roomKey;
            } catch (error) {
                console.error(`Failed to decrypt invitation ID ${inv.invitation_id}:`, error);
            }
        }
        
        // If no invitation could be decrypted
        return null;
    } catch (error) {
        console.error('Error handling user invitations:', error);
        throw error;
    }
}

/**
 * Complete the invitation acceptance process
 * @param {string} invitation_id - ID of the invitation
 * @param {CryptoKey} roomKey - Decrypted room key
 * @param {string} url - API endpoint URL
 * @returns {Promise<Object>} Room data
 */
export async function acceptInvitation(invitation_id, roomKey, url) {
    if (!invitation_id || !roomKey || !url) {
        throw new Error('Invitation ID, room key, and URL are required');
    }

    try {
        const csrfToken = getCsrfToken();
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken
            },
            body: JSON.stringify({ invitation_id: invitation_id })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server Error:', errorData.error || 'Unknown error');
            throw new Error(`Server Error: ${errorData.error || response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !data.room || !data.room.slug) {
            throw new Error('Failed to accept invitation: ' + (data.message || 'No details provided'));
        }
        
        // Store room key in keychain
        await keychainGet(data.room.slug, roomKey, true);
        
        return data.room;
    } catch (error) {
        console.error('Failed to accept invitation:', error);
        throw error;
    }
}
//#endregion

/**
 * Gets CSRF token from meta tag or session storage
 * @returns {string} CSRF token
 * @private
 */
function getCsrfToken() {
    // Try to get from meta tag
    const metaTag = document.querySelector('meta[name="csrf-token"]');
    if (metaTag) {
        return metaTag.getAttribute('content');
    }
    
    // Try to get from session storage
    const token = sessionStorage.getItem('csrf-token');
    if (token) {
        return token;
    }
    
    console.warn("CSRF token not found");
    return '';
}