
import Echo from 'laravel-echo';

import Pusher from 'pusher-js';

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

export async function fetchData(url, token){
    // const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                // 'X-CSRF-TOKEN': csrfToken
                'Authorization': `bearer ${token}`
            },
        });
        const data = await response.json();
        if (data.success) {
            return data;
        } else {
            console.error('Failed to fetch data!');
        }
    } catch (error) {
        console.error('Failed to fetch data!');
    }
}



export async function postData(url, token, reqData){
    // const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // 'X-CSRF-TOKEN': csrfToken
                'Authorization': `bearer ${token}`
            },
            body: JSON.stringify({reqData})
        });
        const data = await response.json();
        if (data.success) {
            return data;
        } else {
            console.error('Failed to Post Data!');
        }
    } catch (error) {
        console.error('Failed to Post Data!');
    }
}


export async function requestDelete(url, token, body = null) {
    try {
        const response = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `bearer ${token}`
            },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        
        if (!data.success) {            
            console.error('Room removal was not successful!');
        }
        return data.success;

    } catch (error) {
        console.error('Failed to remove room!');
    }
}


export function connectWebSocket(roomSlug, onBroadcasterCallback) {
    const webSocketChannel = `Rooms.${roomSlug}`;

    window.Echo.private(webSocketChannel)
        .listen('RoomMessageEvent', async (e) => {
            try {
                // Decompress the data received from server
                const compressedData = atob(e.data); // Base64 decode
                const binaryData = new Uint8Array(compressedData.split("").map(c => c.charCodeAt(0))); // Convert to Uint8Array
                const jsonString = pako.ungzip(binaryData, { to: "string" }); // Decompress Gzip (pako lib)
                const data = JSON.parse(jsonString); // Parse JSON data

                // Handle the decompressed data here (e.g., update UI, call a callback)
                console.log(data);
                onBroadcasterCallback?.(data); // Call the callback with data if provided

            } catch (error) {
                console.error("Failed to decompress message:", error);
            }
        });
}

//#endregion

//#region SEARCH

// NOTE: THIS ONE NEEDS REVIEW
let tempSearchResult;
export async function onSearchUser(query) {
    
    if (query.length > 3) {
        
        try {
            const response = await fetch(`${hawkiUrl}/req/search?query=${encodeURIComponent(query)}`);
            const data = await response.json();

            if (data.success) {

                data.users.forEach(user => {
                    tempSearchResult.push(user);
                });
                return tempSearchResult;
            } else {
                tempSearchResult = [];
            }
        } catch (error) {
            tempSearchResult = [];
            console.error('There was an error processing your request.', error);
            return tempSearchResult;
        }
    } else {
        tempSearchResult = [];
        return tempSearchResult;
    }
}

//#endregion



//#region MESSAGE


export async function onSubmitMessageToServer(inputText, threadID, roomSlug, userToken) {

    inputText = escapeHTML(inputText.trim());   // Sanitize input to prevent XSS

    // Encrypt message with room key
    const roomKey = await keychainGet(roomSlug); // From encryption.js - get stored room key
    const contData = await encryptWithSymKey(roomKey, inputText, false); // From encryption.js - encrypt message
    
    // Prepare message object for sending
    const messageObj = {
        content: contData.ciphertext,
        iv: contData.iv,                // Initialization vector for encryption
        tag: contData.tag,              // Authentication tag for encryption
        threadID: threadID,    // Current thread being replied to
    };

    // Send message to server and get response with message ID
    const url = `${hawkiUrl}/req/room/sendMessage/${activeRoom.slug}`;
    const serverData = postData(url, userToken, messageObj);
    const msgData = serverData.messageData;
    
    msgData.content = inputText;
    return msgData;
}


export function detectMentioning(rawText){
    // aiMentioned: if AI is mentioned
    // filteredText: text without mentioning,
    // modifiedText: text with mentioning (bold),
    // aiMention: the mentioning of ai,
    // userMentions: mentioning members of the room.
    let returnObj = {
        aiMentioned: false,
        filteredText: rawText,
        modifiedText: rawText,
        aiMention: "",
        userMentions: []
    };

    const mentionRegex = /@\w+/g;
    const mentionMatches = rawText.match(mentionRegex);

    if (mentionMatches) {
        let processedText = rawText;
        
        for (const mention of mentionMatches) {
            if (mention.toLowerCase() === aiHandle.toLowerCase()) {
                returnObj.aiMentioned = true;
                returnObj.aiMention = mention; // Remove the '@' for aiMention
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


export async function BuildAiRequestObject(){

    // Create AI-specific encryption key
    const aiCryptoSalt = await fetchServerSalt('AI_CRYPTO_SALT');  // From encryption.js - get salt
    const aiKey = await deriveKey(roomKey, activeRoom.slug, aiCryptoSalt); // Derive AI-specific key
    const aiKeyRaw = await exportSymmetricKey(aiKey);  // Export key for transmission
    const aiKeyBase64 = arrayBufferToBase64(aiKeyRaw); // Convert to base64

    // Prepare message attributes for AI
    const msgAttributes = {
        'threadIndex': activeThreadIndex,
        'broadcasting': true,        // Broadcast to all room members
        'slug': activeRoom.slug,
        'key': aiKeyBase64,          // Encrypted key for AI to use
        'stream': false,             // Not using streaming for this message
    }


}


//#endregion


//#region INVITATION

/**
 * Create and send encrypted invitations to a list of users
 * @param {Array} usersList - List of user objects to invite
 * @param {string} roomSlug - Room slug to invite users to
 */
export async function createAndSendInvitations(usersList, roomSlug){
    // Get the room encryption key
    const roomKey = await keychainGet(roomSlug);  // From encryption.js
    const invitations = [];
    
    // Process each invitee
    for (const invitee of usersList) {
        let invitation;
        
        // For users with a public key, use asymmetric encryption
        if (invitee.publicKey) {
            // Encrypt room key with the user's public key
            const encryptedRoomKey = await encryptWithPublicKey(roomKey, base64ToArrayBuffer(invitee.publicKey)); // From encryption.js
            
            invitation = {
                username: invitee.username,
                encryptedRoomKey: encryptedRoomKey.ciphertext, // The encrypted room key
                iv: '0',                                       // Not used for public key encryption
                tag: '0',                                      // Not used for public key encryption
                role: invitee.role                             // User's role in the room
            };
        } else {
            // For external users without a public key, use temp hash method
            // Generate a temporary hash for email-based invitation
            const tempHash = generateTempHash();                      // From encryption.js
            const encryptedRoomKey = await encryptWithTempHash(roomKey, tempHash); // From encryption.js

            invitation = {
                username: invitee.username,
                encryptedRoomKey: encryptedRoomKey.ciphertext,
                iv: encryptedRoomKey.iv,
                tag: encryptedRoomKey.tag,
                role: invitee.role
            };

            // Send email with invitation link containing temp hash
            const mailContent = {
                username: invitee.username,
                hash: tempHash,
                slug: roomSlug
            }
            await sendInvitationEmail(mailContent);
        }
        invitations.push(invitation);
    }
    
    // Store all invitations on the server
    requestStoreInvitationsOnServer(invitations, roomSlug);
}

/**
 * Store invitations on the server database
 * @param {Array} invitations - List of invitation objects
 * @param {string} slug - Room slug
 */
async function requestStoreInvitationsOnServer(invitations, slug){
    await fetch(`/req/inv/store-invitations/${slug}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content') 
        },
        body: JSON.stringify({invitations})
    });
}

/**
 * Send invitation email to users without public keys
 * @param {Object} mailContent - Email content with username, hash, and slug
 */
async function sendInvitationEmail(mailContent){
    await fetch(`/req/inv/sendExternInvitation`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content') 
        },
        body: JSON.stringify(mailContent)
    });
}

/**
 * @param {Array} invitations
 * Handle invitations sent to the current user
 * Called during application initialization
 */
export async function handleUserInvitations(invitations) {
    try { 
        const privateKeyBase64 = await keychainGet('privateKey');  // From encryption.js
        // Convert private key from Base64 to ArrayBuffer
        const privateKey = base64ToArrayBuffer(privateKeyBase64);  // From encryption.js

        // Process each invitation
        for (const inv of invitations) {
            try {
                // Decrypt room key using user's private key
                const encryptedRoomKeyBuffer = base64ToArrayBuffer(inv.invitation);  // From encryption.js
                const roomKey = await decryptWithPrivateKey(encryptedRoomKeyBuffer, privateKey);  // From encryption.js
                return roomKey;
           
            } catch (error) {
                console.error(`Failed to decrypt invitation: ${inv.invitation_id}`, error);
            }
        }
    }
    catch (error){
        console.error('Error fetching public keys data:', error);
        throw error;
    }
}


/**
 * Complete the invitation acceptance process
 * @param {string} invitation_id - ID of the invitation
 * @param {CryptoKey} roomKey - Decrypted room key
 */
export async function acceptInvitation(invitation_id, roomKey, url){
    // Notify server of successful invitation acceptance
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').getAttribute('content') 
        },
        body: JSON.stringify({ invitation_id: invitation_id })
    });
    
    const data = await response.json();
    if(data.success){
        // Store room key in keychain
        await keychainSet(data.room.slug, roomKey, true);  // From encryption.js
        return data.room;
    }
}


//#endregion