/**
 * HAWKI Encryption Module
 * 
 * Provides cryptographic functions for end-to-end encryption in the HAWKI chat system.
 * Handles key generation, encryption/decryption, and secure key storage.
 */

/**
 * Cache for the user's passkey
 * @type {string|null}
 * @private
 */
let passKey = null;

/**
 * Cache for server salt values to reduce API calls
 * @type {Object}
 * @private
 */
let saltCache = {};

//#region Key Creation

/**
 * Generates a new symmetric encryption key (AES-GCM 256-bit)
 * @returns {Promise<CryptoKey>} The generated symmetric key
 */
export async function generateKey() {
    try {
        const key = await window.crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: 256
            },
            true, // extractable
            ["encrypt", "decrypt"]
        );
        return key;
    } catch (error) {
        console.error("Error generating symmetric key:", error);
        throw new Error("Failed to generate encryption key");
    }
}

/**
 * Generates a new asymmetric key pair (RSA-OAEP 2048-bit)
 * @returns {Promise<CryptoKeyPair>} The generated key pair with public and private keys
 */
export async function generateKeyPair() {
    try {
        const keyPair = await window.crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256",
            },
            true, // extractable
            ["encrypt", "decrypt"]
        );
        return keyPair;
    } catch (error) {
        console.error("Error generating key pair:", error);
        throw new Error("Failed to generate key pair");
    }
}

/**
 * Generates a temporary hash for invitation security
 * @returns {string} 32-character hexadecimal hash
 */
export function generateTempHash() {
    const array = new Uint8Array(16); // 16 bytes = 128 bits
    window.crypto.getRandomValues(array);
    return Array.from(array)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Generates a formatted hash for passkey backup
 * @returns {string} Formatted hash like "xxxx-xxxx-xxxx-xxxx"
 */
export function generatePasskeyBackupHash() {
    const array = new Uint8Array(8); // 8 bytes = 64 bits
    window.crypto.getRandomValues(array);
    return Array.from(array)
        .map(byte => byte.toString(16).padStart(2, '0'))
        .join('')
        .match(/.{1,4}/g)
        .join('-');
}

/**
 * Derives a key from a passkey using PBKDF2
 * @param {string} passkey - Secret passkey to derive from
 * @param {string} label - Purpose label for the derived key
 * @param {Uint8Array} serverSalt - Salt from server for security
 * @returns {Promise<CryptoKey>} The derived key
 */
export async function deriveKey(passkey, label, serverSalt) {
    if (!passkey || !label || !serverSalt) {
        throw new Error("Missing required parameters for key derivation");
    }

    try {
        const enc = new TextEncoder();
        
        // Import the passkey as key material
        const keyMaterial = await window.crypto.subtle.importKey(
            "raw",
            enc.encode(passkey),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        );

        // Combine label and serverSalt to create a unique salt for this derived key
        const combinedSalt = new Uint8Array([
            ...new TextEncoder().encode(label), 
            ...new Uint8Array(serverSalt)
        ]);

        // Derive the actual key using PBKDF2
        const derivedKey = await window.crypto.subtle.deriveKey(
            {
                name: "PBKDF2",
                salt: combinedSalt,
                iterations: 100000,
                hash: "SHA-256"
            },
            keyMaterial,
            { name: "AES-GCM", length: 256 },
            true, // extractable
            ["encrypt", "decrypt"]
        );

        return derivedKey;
    } catch (error) {
        console.error("Error deriving key:", error);
        throw new Error(`Failed to derive key: ${error.message}`);
    }
}
//#endregion

//#region Encryption

//#region Symmetric Encryption
/**
 * Encrypts data with a symmetric key using AES-GCM
 * @param {CryptoKey} encKey - Symmetric encryption key
 * @param {string|ArrayBuffer} data - Data to encrypt (string or binary)
 * @param {boolean} isKey - Whether the data is a binary key
 * @returns {Promise<Object>} Object containing ciphertext, iv, and tag in Base64
 */
export async function encryptWithSymKey(encKey, data, isKey = false) {
    if (!encKey || data === undefined || data === null) {
        throw new Error("Missing required parameters for encryption");
    }

    try {
        // Generate a random initialization vector
        const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 12-byte IV

        // If the data is a key (binary), skip text encoding
        const encodedData = isKey ? data : new TextEncoder().encode(data);

        // Encrypt the data
        const encryptedData = await window.crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            encKey, // Symmetric key
            encodedData // Data to encrypt
        );

        // Extract the authentication tag (last 16 bytes)
        const tag = encryptedData.slice(-16);
        const ciphertext = encryptedData.slice(0, encryptedData.byteLength - 16);

        // Return ciphertext, iv, and tag as Base64 encoded
        return {
            ciphertext: arrayBufferToBase64(ciphertext),
            iv: arrayBufferToBase64(iv),
            tag: arrayBufferToBase64(tag)
        };
    } catch (error) {
        console.error("Error encrypting with symmetric key:", error);
        throw new Error(`Encryption failed: ${error.message}`);
    }
}

/**
 * Decrypts data with a symmetric key using AES-GCM
 * @param {CryptoKey} encKey - Symmetric encryption key
 * @param {string} ciphertext - Base64-encoded encrypted data
 * @param {string} iv - Base64-encoded initialization vector
 * @param {string} tag - Base64-encoded authentication tag
 * @param {boolean} isKey - Whether the result should be returned as binary
 * @returns {Promise<string|Uint8Array>} Decrypted data as string or binary
 */
export async function decryptWithSymKey(encKey, ciphertext, iv, tag, isKey = false) {
    if (!encKey || !ciphertext || !iv || !tag) {
        throw new Error("Missing required parameters for decryption");
    }

    try {
        // Convert Base64-encoded ciphertext, IV, and tag back to ArrayBuffers
        const ciphertextBuffer = base64ToArrayBuffer(ciphertext);
        const ivBuffer = base64ToArrayBuffer(iv);
        const tagBuffer = base64ToArrayBuffer(tag);

        // Recombine ciphertext and tag (AES-GCM requires them together for decryption)
        const combinedBuffer = new Uint8Array(ciphertextBuffer.byteLength + tagBuffer.byteLength);
        combinedBuffer.set(new Uint8Array(ciphertextBuffer), 0);
        combinedBuffer.set(new Uint8Array(tagBuffer), ciphertextBuffer.byteLength);

        // Decrypt the combined ciphertext and tag
        const decryptedData = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: ivBuffer
            },
            encKey, // Symmetric key
            combinedBuffer // Combined ciphertext + tag
        );

        // Return decrypted data (binary or text based on isKey)
        return isKey ? new Uint8Array(decryptedData) : new TextDecoder().decode(decryptedData);
    } catch (error) {
        console.error("Decryption failed:", error);
        throw new Error(`Decryption failed: ${error.message}`);
    }
}
//#endregion

//#region Asymmetric Encryption
/**
 * Encrypts a room key with a user's public key using RSA-OAEP
 * @param {CryptoKey} roomKey - Symmetric room key to encrypt
 * @param {ArrayBuffer} publicKey - Recipient's public key
 * @returns {Promise<Object>} Object containing encrypted key in Base64
 */
export async function encryptWithPublicKey(roomKey, publicKey) {
    if (!roomKey || !publicKey) {
        throw new Error("Missing required parameters for public key encryption");
    }

    try {
        // Export the roomKey (CryptoKey) to raw format (ArrayBuffer)
        const exportedRoomKey = await exportSymmetricKey(roomKey);

        // Import the recipient's public key
        const importedPublicKey = await window.crypto.subtle.importKey(
            "spki", // Key format
            publicKey, // Recipient's public key in ArrayBuffer format
            {
                name: "RSA-OAEP",
                hash: { name: "SHA-256" },
            },
            false, // Not extractable
            ["encrypt"]
        );

        // Encrypt the exported roomKey using the recipient's public key
        const encryptedRoomKey = await window.crypto.subtle.encrypt(
            {
                name: "RSA-OAEP",
            },
            importedPublicKey,
            exportedRoomKey // The raw bytes of the roomKey
        );

        // Return the encrypted roomKey as Base64 string
        return {
            ciphertext: arrayBufferToBase64(encryptedRoomKey),
        };
    } catch (error) {
        console.error("Error encrypting with public key:", error);
        throw new Error(`Public key encryption failed: ${error.message}`);
    }
}

/**
 * Decrypts a room key with the user's private key using RSA-OAEP
 * @param {ArrayBuffer} encryptedData - Encrypted room key
 * @param {ArrayBuffer} privateKey - User's private key
 * @returns {Promise<CryptoKey>} Decrypted room key
 */
export async function decryptWithPrivateKey(encryptedData, privateKey) {
    if (!encryptedData || !privateKey) {
        throw new Error("Missing required parameters for private key decryption");
    }

    try {
        // Import the user's private key
        const importedPrivateKey = await window.crypto.subtle.importKey(
            "pkcs8", // Key format
            privateKey, // User's private key in ArrayBuffer format
            {
                name: "RSA-OAEP",
                hash: { name: "SHA-256" },
            },
            false, // Not extractable
            ["decrypt"]
        );

        // Decrypt the encrypted roomKey
        const decryptedRoomKeyBytes = await window.crypto.subtle.decrypt(
            {
                name: "RSA-OAEP",
            },
            importedPrivateKey,
            encryptedData // Encrypted symmetric key in ArrayBuffer format
        );

        // Import the decrypted bytes back into a CryptoKey object
        const roomKey = await window.crypto.subtle.importKey(
            "raw",
            decryptedRoomKeyBytes,
            {
                name: "AES-GCM",
            },
            true, // Extractable
            ["encrypt", "decrypt"]
        );

        // Return the reconstructed roomKey (CryptoKey object)
        return roomKey;
    } catch (error) {
        console.error("Error decrypting with private key:", error);
        throw new Error(`Private key decryption failed: ${error.message}`);
    }
}
//#endregion

//#region Temporary Hash Encryption
/**
 * Encrypts a room key with a temporary hash for invitation links
 * @param {CryptoKey} roomKey - Room key to encrypt
 * @param {string} tempHash - Temporary hash for invitation security
 * @returns {Promise<Object>} Object containing encrypted data in Base64
 */
export async function encryptWithTempHash(roomKey, tempHash) {
    if (!roomKey || !tempHash) {
        throw new Error("Missing required parameters for temp hash encryption");
    }

    try {
        // Export the room key to raw format
        const exportedRoomKey = await exportSymmetricKey(roomKey);

        // Fetch server salt
        const severSalt = await fetchServerSalt('INVITATION_SALT');

        // Derive a key from the temporary hash
        const derivedKey = await deriveKey(tempHash, 'invitation_key', severSalt);

        // Encrypt the room key using the derived key
        const encryptedRoomKeyData = await encryptWithSymKey(derivedKey, exportedRoomKey, true);

        // Return both IV and the encrypted ciphertext (including tag)
        return {
            tag: encryptedRoomKeyData.tag,
            iv: encryptedRoomKeyData.iv,
            ciphertext: encryptedRoomKeyData.ciphertext
        };
    } catch (error) {
        console.error("Error encrypting with temp hash:", error);
        throw new Error(`Temp hash encryption failed: ${error.message}`);
    }
}

/**
 * Decrypts a room key using a temporary hash from an invitation link
 * @param {string} encryptedData - Base64-encoded encrypted room key
 * @param {string} tempHash - Temporary hash from invitation link
 * @param {string} iv - Base64-encoded initialization vector
 * @param {string} tag - Base64-encoded authentication tag
 * @returns {Promise<CryptoKey>} Decrypted room key
 */
export async function decryptWithTempHash(encryptedData, tempHash, iv, tag) {
    if (!encryptedData || !tempHash || !iv || !tag) {
        throw new Error("Missing required parameters for temp hash decryption");
    }

    try {
        //fetch server salt
        const severSalt = await fetchServerSalt('INVITATION_SALT');

        // Derive the key from the temporary hash using the salt
        const derivedKey = await deriveKey(tempHash, 'invitation_key', severSalt);

        // Decrypt the data
        const decryptedData = await decryptWithSymKey(derivedKey, encryptedData, iv, tag, true);

        // Import the decrypted data as a symmetric key
        const roomKey = await importSymmetricKey(decryptedData);

        return roomKey;
    } catch (error) {
        console.error("Error decrypting with temp hash:", error);
        throw new Error(`Temp hash decryption failed: ${error.message}`);
    }
}
//#endregion

//#endregion

//#region Keychain Access
/**
 * Opens the HAWKI IndexedDB database
 * @returns {Promise<IDBDatabase>} IndexedDB database instance
 * @private
 */
async function openHawkIDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('HAWKI', 1);

        request.onupgradeneeded = function (event) {
            const db = event.target.result;
            console.log('Initializing the database.');
            if (!db.objectStoreNames.contains('keychains')) {
                db.createObjectStore('keychains', { keyPath: 'username' });
                console.log('Created object store: keychains');
            }
        };

        request.onsuccess = function (event) {
            resolve(event.target.result);
        };

        request.onerror = function (event) {
            reject(`Failed to open IndexedDB: ${event.target.error}`);
        };
    });
}

/**
 * Stores a key-value pair in the encrypted keychain
 * @param {string} key - Key identifier
 * @param {CryptoKey|any} value - Value to store (CryptoKey or other data)
 * @param {boolean} formatToJWK - Whether to format the value as JWK
 * @param {boolean} backup - Whether to back up the keychain to the server
 * @returns {Promise<Object>} Encrypted keychain data
 */
export async function keychainSet(key, value, formatToJWK, backup = true) {
    if (!key || value === undefined || value === null) {
        throw new Error("Missing required parameters for keychain set");
    }

    // Get user info from session or local storage
    const userInfo = getUserInfo();
    if (!userInfo || !userInfo.username) {
        throw new Error("User information not available");
    }

    try {
        // Format the value as JWK if needed
        if (formatToJWK) {
            value = await exportKeyValueToJWK(value);
        }

        // Try to open and decrypt the existing keychain
        let keychain;
        try {
            keychain = await openKeychain(userInfo.username);
        } catch (error) {
            console.warn("Failed to open or decrypt keychain. Creating a new one.");
            keychain = {}; // Initialize a new keychain if there's an error
        }

        // Update keychain with username, timestamp, and new key-value pair
        keychain['username'] = userInfo.username;
        keychain['time-signature'] = Date.now();
        keychain[key] = value;

        const keychainString = JSON.stringify(keychain);

        // Encrypt the updated keychain
        const passKey = await getPassKey();
        const udSalt = await fetchServerSalt('USERDATA_ENCRYPTION_SALT');
        const keychainEncryptor = await deriveKey(passKey, "keychain_encryptor", udSalt);
        const encKeychainData = await encryptWithSymKey(keychainEncryptor, keychainString, false);

        // Store the encrypted keychain in IndexedDB
        const db = await openHawkIDatabase();
        const transaction = db.transaction('keychains', 'readwrite');
        const store = transaction.objectStore('keychains');

        const keychainData = {
            ciphertext: encKeychainData.ciphertext,
            iv: encKeychainData.iv,
            tag: encKeychainData.tag,
        };

        const userData = {
            username: userInfo.username,
            keychain: keychainData,
        };

        return new Promise((resolve, reject) => {
            const storeRequest = store.put(userData);

            storeRequest.onsuccess = function () {
                console.log("Keychain successfully stored in IndexedDB.");
                if (backup) {
                    backupKeychainOnServer(encKeychainData, userInfo)
                        .then(() => resolve(encKeychainData))
                        .catch(reject);
                } else {
                    resolve(encKeychainData);
                }
            };

            storeRequest.onerror = function (event) {
                console.error("Error storing keychain:", event.target.error);
                reject(event.target.error);
            };
        });
    } catch (error) {
        console.error("Error setting keychain value:", error);
        throw new Error(`Failed to set keychain value: ${error.message}`);
    }
}

/**
 * Retrieves a value from the encrypted keychain
 * @param {string} key - Key identifier to retrieve
 * @returns {Promise<any>} Retrieved value (may be a CryptoKey)
 */
export async function keychainGet(key) {
    if (!key) {
        throw new Error("Key is required for keychain get");
    }

    // Get user info from session or local storage
    const userInfo = getUserInfo();
    if (!userInfo || !userInfo.username) {
        throw new Error("User information not available");
    }

    try {
        const keychain = await openKeychain(userInfo.username);
        if (!keychain) {
            console.warn("No keychain available. Returning null.");
            return null;
        }

        if (!(key in keychain)) {
            console.warn(`Key "${key}" not found in keychain.`);
            return null;
        }

        // If the value is in JWK format, import it as a CryptoKey
        try {
            const keyValue = await importKeyValueFromJWK(keychain[key]);
            return keyValue;
        } catch (error) {
            // If not a JWK, return the raw value
            return keychain[key];
        }
    } catch (error) {
        console.error(`Error getting key "${key}" from keychain:`, error);
        throw new Error(`Failed to get keychain value: ${error.message}`);
    }
}

/**
 * Opens and decrypts the keychain from IndexedDB
 * @param {string} username - Username to retrieve keychain for
 * @returns {Promise<Object>} Decrypted keychain object
 * @private
 */
async function openKeychain(username) {
    if (!username) {
        throw new Error("Username is required to open keychain");
    }

    try {
        const db = await openHawkIDatabase();
        const transaction = db.transaction('keychains', 'readonly');
        const store = transaction.objectStore('keychains');

        return new Promise((resolve, reject) => {
            const request = store.get(username);

            request.onsuccess = async function (event) {
                const result = event.target.result;

                if (!result) {
                    console.warn('No keychain found for user, initializing a new keychain.');
                    resolve({}); // Return an empty object if no entry exists
                    return;
                }

                const { ciphertext, iv, tag } = result.keychain;

                // Verify that required fields exist
                if (!ciphertext || !iv || !tag) {
                    console.error("Incomplete keychain data in IndexedDB:", result);
                    reject(new Error("Keychain data is missing required fields"));
                    return;
                }

                try {
                    const passKey = await getPassKey();
                    const udSalt = await fetchServerSalt('USERDATA_ENCRYPTION_SALT');
                    const keychainEncryptor = await deriveKey(passKey, "keychain_encryptor", udSalt);

                    const decryptedKeychain = await decryptWithSymKey(
                        keychainEncryptor,
                        ciphertext,
                        iv,
                        tag,
                        false  // Expecting text output
                    );

                    const keychain = JSON.parse(decryptedKeychain);
                    resolve(keychain);
                } catch (error) {
                    console.error("Error decrypting keychain:", error);
                    reject(error);
                }
            };

            request.onerror = function (event) {
                console.error('Error fetching keychain from IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    } catch (error) {
        console.error("Error opening keychain:", error);
        throw new Error(`Failed to open keychain: ${error.message}`);
    }
}

/**
 * Backs up the encrypted keychain to the server
 * @param {Object} encKeychainData - Encrypted keychain data
 * @param {Object} userInfo - User information
 * @returns {Promise<void>}
 * @private
 */
async function backupKeychainOnServer(encKeychainData, userInfo) {
    if (!encKeychainData || !userInfo) {
        throw new Error("Missing required parameters for keychain backup");
    }

    const requestObject = {
        ciphertext: encKeychainData.ciphertext,
        iv: encKeychainData.iv,
        tag: encKeychainData.tag,
    };

    try {
        // Get CSRF token from meta tag or session storage
        const csrfToken = getCsrfToken();
        
        const response = await fetch('/req/backupKeychain', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken,
            },
            body: JSON.stringify(requestObject)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server Error:', errorData.error);
            throw new Error(`Server Error: ${errorData.error}`);
        }

        const data = await response.json();

        if (data.success) {
            console.log('Keychain backup successful...');
        } else {
            console.log('Failed to make backup for keychain');
        }
    } catch (error) {
        console.error('Error storing keychain backup:', error);
        throw error;
    }
}

/**
 * Synchronizes the local keychain with the server version
 * @param {string} serverKeychainData - Server keychain data in JSON format
 * @returns {Promise<void>}
 */
export async function syncKeychain(serverKeychainData) {
    if (!serverKeychainData) {
        throw new Error("Server keychain data is required for sync");
    }

    try {
        const { keychain, KCIV, KCTAG } = JSON.parse(serverKeychainData);
        const userInfo = getUserInfo();
        
        if (!userInfo || !userInfo.username) {
            throw new Error("User information not available");
        }

        const passKey = await getPassKey();
        const udSalt = await fetchServerSalt('USERDATA_ENCRYPTION_SALT');
        const keychainEncryptor = await deriveKey(passKey, "keychain_encryptor", udSalt);

        let serverKeychain;
        try {
            serverKeychain = await decryptWithSymKey(keychainEncryptor, keychain, KCIV, KCTAG, false);
            serverKeychain = JSON.parse(serverKeychain);
        } catch (error) {
            console.error("Error decrypting server keychain:", error);
            throw error; // Prevent further sync attempts with corrupted server data
        }

        const localKeychain = await openKeychain(userInfo.username);

        if (!localKeychain || (serverKeychain['time-signature'] > (localKeychain['time-signature'] || 0))) {
            console.log("Updating local keychain with server data.");
            const keychainString = JSON.stringify(serverKeychain);
            const encKeychainData = await encryptWithSymKey(keychainEncryptor, keychainString, false);

            const db = await openHawkIDatabase();
            const transaction = db.transaction('keychains', 'readwrite');
            const store = transaction.objectStore('keychains');

            const keychainData = {
                ciphertext: encKeychainData.ciphertext,
                iv: encKeychainData.iv,
                tag: encKeychainData.tag,
            };

            const userData = {
                username: userInfo.username,
                keychain: keychainData,
            };

            return new Promise((resolve, reject) => {
                const storeRequest = store.put(userData);

                storeRequest.onsuccess = function () {
                    console.log("Local keychain updated successfully.");
                    resolve();
                };

                storeRequest.onerror = function (event) {
                    console.error("Error updating local keychain:", event.target.error);
                    reject(event.target.error);
                };
            });
        } else {
            console.log("Local keychain is newer. Uploading to server.");
            const keychainString = JSON.stringify(localKeychain);
            const encKeychainData = await encryptWithSymKey(keychainEncryptor, keychainString, false);
            await backupKeychainOnServer(encKeychainData, userInfo);
        }
    } catch (error) {
        console.error("Error syncing keychain:", error);
        throw new Error(`Failed to sync keychain: ${error.message}`);
    }
}

/**
 * Removes a keychain from IndexedDB
 * @param {string} username - Username to remove keychain for
 * @returns {Promise<string>} Success message
 */
export async function removeKeychain(username) {
    if (!username) {
        throw new Error("Username is required to remove keychain");
    }

    try {
        const db = await openHawkIDatabase();
        const transaction = db.transaction('keychains', 'readwrite');
        const store = transaction.objectStore('keychains');

        return new Promise((resolve, reject) => {
            const request = store.delete(username);

            request.onsuccess = function () {
                console.log(`Keychain entry for username '${username}' successfully removed.`);
                resolve(`Keychain entry for username '${username}' removed.`);
            };

            request.onerror = function (event) {
                console.error(`Error removing keychain for username '${username}':`, event.target.error);
                reject(event.target.error);
            };
        });
    } catch (error) {
        console.error("Failed to open IndexedDB or remove keychain:", error);
        throw error;
    }
}
//#endregion

//#region Utilities
/**
 * Fetches a salt value from the server by label
 * @param {string} saltLabel - Label of the salt to fetch
 * @returns {Promise<Uint8Array>} Salt as Uint8Array
 */
export async function fetchServerSalt(saltLabel) {
    if (!saltLabel) {
        throw new Error("Salt label is required");
    }

    // Return cached salt if available
    if (saltCache[saltLabel]) {
        const salt = saltCache[saltLabel];
        return Uint8Array.from(atob(salt), c => c.charCodeAt(0));
    }

    try {
        // Get CSRF token from meta tag or session storage
        const csrfToken = getCsrfToken();
        
        // Make a GET request to the server with saltlabel in the headers
        const response = await fetch('/req/crypto/getServerSalt', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'saltlabel': saltLabel,
                'X-CSRF-TOKEN': csrfToken,
            },
        });

        // Check if the server responded with an error
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server Error:', errorData.error);
            throw new Error(`Server Error: ${errorData.error}`);
        }

        // Parse the JSON response
        const data = await response.json();

        // Convert the base64-encoded salt to a Uint8Array
        const serverSalt = Uint8Array.from(atob(data.salt), c => c.charCodeAt(0));
        saltCache[saltLabel] = data.salt; // Cache the salt for future use
        return serverSalt;
    } catch (error) {
        console.error('Error fetching salt:', error);
        throw error;
    }
}

/**
 * Converts an ArrayBuffer to a Base64 string
 * @param {ArrayBuffer} buffer - Binary data to convert
 * @returns {string} Base64-encoded string
 */
export function arrayBufferToBase64(buffer) {
    const binary = String.fromCharCode.apply(null, new Uint8Array(buffer));
    return btoa(binary);
}

/**
 * Converts a Base64 string to an ArrayBuffer
 * @param {string} base64 - Base64-encoded string
 * @returns {ArrayBuffer} Decoded binary data
 */
export function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Exports a CryptoKey to JWK format
 * @param {CryptoKey} keyValue - Key to export
 * @returns {Promise<Object>} Key in JWK format
 */
export async function exportKeyValueToJWK(keyValue) {
    if (!keyValue) {
        throw new Error("Key value is required for export");
    }
    
    try {
        return await window.crypto.subtle.exportKey("jwk", keyValue);
    } catch (error) {
        console.error("Error exporting key to JWK:", error);
        throw new Error(`Failed to export key: ${error.message}`);
    }
}

/**
 * Imports a JWK into a CryptoKey
 * @param {Object} jwk - Key in JWK format
 * @returns {Promise<CryptoKey|Object>} Imported key or original object if not a JWK
 */
export async function importKeyValueFromJWK(jwk) {
    if (!jwk) {
        throw new Error("JWK is required for import");
    }
    
    try {
        // Check if the input is a JWK by looking for key properties
        if (jwk && typeof jwk === 'object' && jwk.kty) {
            const value = await window.crypto.subtle.importKey(
                "jwk",
                jwk,
                {
                    name: "AES-GCM",
                    length: 256
                },
                true,
                ["encrypt", "decrypt"]
            );
            return value;
        }
        // If not a JWK, return the original value
        return jwk;
    } catch (error) {
        console.error("Error importing key from JWK:", error);
        // If import fails, assume it's not a key and return the original
        return jwk;
    }
}

/**
 * Exports a symmetric key to raw format
 * @param {CryptoKey} key - Symmetric key to export
 * @returns {Promise<ArrayBuffer>} Raw key data
 */
export async function exportSymmetricKey(key) {
    if (!key) {
        throw new Error("Key is required for export");
    }
    
    try {
        return await window.crypto.subtle.exportKey("raw", key);
    } catch (error) {
        console.error("Error exporting symmetric key:", error);
        throw new Error(`Failed to export symmetric key: ${error.message}`);
    }
}

/**
 * Imports raw key data as a symmetric key
 * @param {ArrayBuffer} rawKey - Raw key data
 * @returns {Promise<CryptoKey>} Imported symmetric key
 */
export async function importSymmetricKey(rawKey) {
    if (!rawKey) {
        throw new Error("Raw key data is required for import");
    }
    
    try {
        if (rawKey.byteLength !== 16 && rawKey.byteLength !== 32) {
            throw new Error("AES key must be 128 or 256 bits");
        }

        return await window.crypto.subtle.importKey(
            "raw",
            rawKey,
            {
                name: "AES-GCM",
                length: rawKey.byteLength * 8 // Convert byteLength to bits
            },
            true, // extractable
            ["encrypt", "decrypt"]
        );
    } catch (error) {
        console.error("Error importing symmetric key:", error);
        throw new Error(`Failed to import symmetric key: ${error.message}`);
    }
}

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

/**
 * Gets user information from session storage or global variable
 * @returns {Object} User information object
 * @private
 */
function getUserInfo() {
    // Try to get from global variable
    if (typeof window !== 'undefined' && typeof window.userInfo !== 'undefined' && window.userInfo) {
        return window.userInfo;
    }
    
    // Try to get from session storage
    if (typeof sessionStorage !== 'undefined') {
        const userInfoStr = sessionStorage.getItem('userInfo');
        if (userInfoStr) {
            try {
                return JSON.parse(userInfoStr);
            } catch (e) {
                console.error("Error parsing userInfo from session storage:", e);
            }
        }
    }
    
    console.warn("User information not found");
    return null;
}
//#endregion

//#region PassKey Management
/**
 * Gets the user's passkey from memory or storage
 * @returns {Promise<string>} User's passkey
 */
export async function getPassKey() {
    // Return cached passkey if available
    if (passKey) {
        return passKey;
    }
    
    const userInfo = getUserInfo();
    if (!userInfo || !userInfo.username) {
        throw new Error("User information not available");
    }
    
    try {
        // Try to get from localStorage
        const keyData = localStorage.getItem(`${userInfo.username}PK`);
        if (!keyData) {
            return null;
        }
        
        const keyJson = JSON.parse(keyData);
        const salt = await fetchServerSalt('PASSKEY_SALT');
        const key = await deriveKey(userInfo.email, userInfo.username, salt);
    
        passKey = await decryptWithSymKey(key, keyJson.ciphertext, keyJson.iv, keyJson.tag, false);
        
        // Verify the passkey works by testing it
        if (await testPassKey(passKey, userInfo.username)) {
            return passKey;
        } else {
            return null;
        }
    } catch (error) {
        console.log("Passkey not found or invalid:", error);
        return null;
    }
}

/**
 * Sets a new passkey for the user
 * @param {string} enteredKey - New passkey to set
 * @returns {Promise<null|string>} The set passkey or null if failed
 */
export async function setPassKey(enteredKey) {
    if (!enteredKey) {
        return null;
    }
    
    const userInfo = getUserInfo();
    if (!userInfo || !userInfo.username) {
        throw new Error("User information not available");
    }
    
    try {
        const salt = await fetchServerSalt('PASSKEY_SALT');
        const key = await deriveKey(userInfo.email, userInfo.username, salt);

        const encryptedPassKeyData = await encryptWithSymKey(key, enteredKey, false);

        localStorage.setItem(`${userInfo.username}PK`, JSON.stringify(encryptedPassKeyData));
        passKey = enteredKey;
        return passKey;
    } catch (error) {
        console.error("Error setting passkey:", error);
        throw new Error(`Failed to set passkey: ${error.message}`);
    }
}

/**
 * Tests if a passkey can successfully decrypt the keychain
 * @param {string} testPassKey - Passkey to test
 * @param {string} username - Username to test passkey for
 * @returns {Promise<boolean>} Whether the passkey is valid
 */
export async function testPassKey(testPassKey, username) {
    if (!testPassKey) {
        return false;
    }
    
    try {
        // Get user info if not provided
        if (!username) {
            const userInfo = getUserInfo();
            if (!userInfo || !userInfo.username) {
                return false;
            }
            username = userInfo.username;
        }
        
        // Try to decrypt the keychain with this passkey
        const keychain = await openKeychain(username);
        return keychain && keychain.username === username;
    } catch (error) {
        console.error("Error testing passkey:", error);
        return false;
    }
}
//#endregion

/**
 * Cleans up user data from storage
 * @param {string} username - Username to clean up data for
 * @param {Function} callback - Optional callback function
 * @returns {Promise<void>}
 */
export async function cleanupUserData(username, callback) {
    if (!username) {
        const userInfo = getUserInfo();
        if (!userInfo || !userInfo.username) {
            throw new Error("Username is required for cleanup");
        }
        username = userInfo.username;
    }
    
    try {
        // Cleanup localStorage
        if (localStorage.getItem(`${username}PK`)) {
            localStorage.removeItem(`${username}PK`);
        }

        // Remove the keychain from IndexedDB
        await removeKeychain(username);

        console.log("Cleanup completed successfully.");

        // If a callback is provided, invoke it
        if (callback && typeof callback === 'function') {
            callback();
        }
    } catch (error) {
        console.error("Error during cleanup:", error);

        // Optional: Invoke callback with an error
        if (callback && typeof callback === 'function') {
            callback(error);
        }
    }
}