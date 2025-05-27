/**
 * HAWKI Handshake Functions
 * 
 * This module provides functions for user authentication, passkey verification,
 * and key recovery in the HAWKI secure chat system.
 */

import { setPassKey, fetchServerSalt, deriveKey, decryptWithSymKey, syncKeychain } from './encryption';

/**
 * Verifies an entered passkey and redirects to chat if successful
 * @param {string} enteredKey - The passkey to verify
 * @param {string} serverKeychainCryptoData - Encrypted keychain data from server
 * @param {Function} onSuccess - Callback function on successful verification
 * @param {Function} onError - Callback function on verification error
 * @returns {Promise<Object>} Result object with success status and message
 */
export async function verifyEnteredPassKey(enteredKey, serverKeychainCryptoData, onSuccess, onError) {
    if (!enteredKey) {
        const result = {
            'success': false,
            'message': 'Key value cannot be empty!'
        };
        
        if (onError && typeof onError === 'function') {
            onError(result.message);
        }
        
        return result;
    }

    try {
        // Verify the passkey
        const isValid = await verifyPasskey(enteredKey, serverKeychainCryptoData);
        
        if (isValid) {
            // Set the passkey in local storage
            await setPassKey(enteredKey);
            
            // Sync the keychain with server data
            await syncKeychain(serverKeychainCryptoData);
            
            // Call success callback if provided
            if (onSuccess && typeof onSuccess === 'function') {
                onSuccess();
            }
            
            return {
                'success': true,
                'message': 'Passkey verified successfully'
            };
        } else {
            const result = {
                'success': false,
                'message': 'Failed to verify passkey. Please try again.'
            };
            
            if (onError && typeof onError === 'function') {
                onError(result.message);
            }
            
            return result;
        }
    } catch (error) {
        console.error('Error verifying passkey:', error);
        
        const result = {
            'success': false,
            'message': `Verification error: ${error.message}`
        };
        
        if (onError && typeof onError === 'function') {
            onError(result.message);
        }
        
        return result;
    }
}

/**
 * Verifies if a passkey can decrypt the server keychain
 * @param {string} passkey - Passkey to verify
 * @param {string} serverKeychainCryptoData - Encrypted keychain data from server
 * @returns {Promise<boolean>} Whether the passkey is valid
 */
export async function verifyPasskey(passkey, serverKeychainCryptoData) {
    if (!passkey || !serverKeychainCryptoData) {
        return false;
    }
    
    try {
        // Parse server keychain data
        const keychainData = JSON.parse(serverKeychainCryptoData);
        if (!keychainData.keychain || !keychainData.KCIV || !keychainData.KCTAG) {
            console.error('Invalid keychain data format');
            return false;
        }
        
        // Get the salt for user data encryption
        const udSalt = await fetchServerSalt('USERDATA_ENCRYPTION_SALT');
        
        // Derive the keychain encryptor key from the passkey
        const keychainEncryptor = await deriveKey(passkey, "keychain_encryptor", udSalt);
        
        // Try to decrypt the keychain
        await decryptWithSymKey(
            keychainEncryptor,
            keychainData.keychain,
            keychainData.KCIV,
            keychainData.KCTAG,
            false
        );
        
        // If decryption didn't throw an error, the passkey is valid
        return true;
    } catch (error) {
        // Decryption failed, so the passkey is invalid
        console.debug("Error during verification:", error);
        return false;
    }
}

/**
 * Helper function to trigger a file upload dialog
 * @param {Function} onFileLoaded - Callback when file is loaded
 * @param {Function} onError - Callback when file format is invalid
 */
export function uploadTextFile(onFileLoaded, onError) {
    // Create a file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt'; // Accept only text files

    // Set up an event listener to handle the file once the user selects it
    input.addEventListener('change', function(event) {
        const file = event.target.files[0]; // Get the first selected file
        if (file) {
            const reader = new FileReader();
            
            // Once the file is read, invoke the callback with the file content
            reader.onload = function(e) {
                const content = e.target.result.trim();
                
                if (isValidBackupKeyFormat(content)) {
                    if (onFileLoaded && typeof onFileLoaded === 'function') {
                        onFileLoaded(content);
                    }
                } else {
                    if (onError && typeof onError === 'function') {
                        onError('The file content does not match the required format.');
                    }
                }
            };
            
            // Read the file as text
            reader.readAsText(file);
        }
    });

    // Trigger the file input dialog
    input.click();
}

/**
 * Validates if a string matches the backup key format (xxxx-xxxx-xxxx-xxxx)
 * @param {string} content - String to validate
 * @returns {boolean} Whether the format is valid
 */
export function isValidBackupKeyFormat(content) {
    if (!content) {
        return false;
    }
    
    // Define a regular expression to match the format xxxx-xxxx-xxxx-xxxx
    const pattern = /^[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}$/;
    return pattern.test(content);
}

/**
 * Extracts a passkey using a backup hash
 * @param {string} backupHash - Backup hash from user
 * @param {Object} userInfo - User information
 * @param {Function} onSuccess - Callback on successful extraction
 * @param {Function} onError - Callback on extraction error
 * @returns {Promise<Object>} Result object with success status and message
 */
export async function extractPasskey(backupHash, userInfo, onSuccess, onError) {
    if (!backupHash) {
        const result = {
            'success': false,
            'message': 'Enter backup hash or upload your backup file.'
        };
        
        if (onError && typeof onError === 'function') {
            onError(result.message);
        }
        
        return result;
    }
    
    if (!isValidBackupKeyFormat(backupHash)) {
        const result = {
            'success': false,
            'message': 'Backup key format is not valid!'
        };
        
        if (onError && typeof onError === 'function') {
            onError(result.message);
        }
        
        return result;
    }

    try {
        // Request passkey backup from server
        const passkeyBackup = await requestPasskeyBackup();
        if (!passkeyBackup) {
            const result = {
                'success': false,
                'message': 'Failed to retrieve passkey backup from server'
            };
            
            if (onError && typeof onError === 'function') {
                onError(result.message);
            }
            
            return result;
        }

        // Derive key from entered backup hash
        const passkeyBackupSalt = await fetchServerSalt('BACKUP_SALT');
        const derivedKey = await deriveKey(backupHash, `${userInfo.username}_backup`, passkeyBackupSalt);
        
        // Decrypt passkey
        const passkey = await decryptWithSymKey(
            derivedKey, 
            passkeyBackup.ciphertext,
            passkeyBackup.iv,
            passkeyBackup.tag, 
            false
        );
        
        // Verify the extracted passkey
        if (await verifyPasskey(passkey, await getServerKeychainData())) {
            // Set the passkey in local storage
            await setPassKey(passkey);
            
            // Call success callback with extracted passkey
            if (onSuccess && typeof onSuccess === 'function') {
                onSuccess(passkey);
            }
            
            return {
                'success': true,
                'message': 'Passkey extracted successfully',
                'passkey': passkey
            };
        } else {
            const result = {
                'success': false,
                'message': 'Failed to verify extracted passkey'
            };
            
            if (onError && typeof onError === 'function') {
                onError(result.message);
            }
            
            return result;
        }
    } catch (error) {
        console.error('Error extracting passkey:', error);
        
        const result = {
            'success': false,
            'message': `Error decrypting passkey with backup code: ${error.message}`
        };
        
        if (onError && typeof onError === 'function') {
            onError(result.message);
        }
        
        return result;
    }
}

/**
 * Requests the passkey backup from the server
 * @returns {Promise<Object>} Passkey backup data
 */
export async function requestPasskeyBackup() {
    try {
        const csrfToken = getCsrfToken();
        
        // Send the request to the server
        const response = await fetch('/req/profile/requestPasskeyBackup', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken
            },
        });

        // Handle the server response
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server Error:', errorData.error);
            throw new Error(`Server Error: ${errorData.error}`);
        }

        const data = await response.json();
        if (data.success) {
            return data.passkeyBackup;
        } else {
            throw new Error('Failed to retrieve passkey backup');
        }
    } catch (error) {
        console.error('Error downloading passkey backup:', error);
        throw error;
    }
}

/**
 * Gets server keychain data for the current user
 * @returns {Promise<string>} Server keychain data in JSON format
 */
export async function getServerKeychainData() {
    try {
        const csrfToken = getCsrfToken();
        
        // Send the request to the server
        const response = await fetch('/req/profile/getKeychain', {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken
            },
        });

        // Handle the server response
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server Error:', errorData.error);
            throw new Error(`Server Error: ${errorData.error}`);
        }

        const data = await response.json();
        if (data.success) {
            return data.keychainData;
        } else {
            throw new Error('Failed to retrieve server keychain data');
        }
    } catch (error) {
        console.error('Error getting server keychain data:', error);
        throw error;
    }
}

/**
 * Syncs keychain and redirects to chat
 * @param {string} serverKeychainCryptoData - Encrypted keychain data from server
 * @param {string} redirectUrl - URL to redirect to after sync
 * @returns {Promise<void>}
 */
export async function redirectToChat(serverKeychainCryptoData, redirectUrl = '/chat') {
    try {
        await syncKeychain(serverKeychainCryptoData);
        
        // Use window.location for client-side redirect
        if (typeof window !== 'undefined') {
            window.location.href = redirectUrl;
        }
    } catch (error) {
        console.error('Error syncing keychain before redirect:', error);
        throw error;
    }
}

/**
 * Requests a user profile reset
 * @returns {Promise<string>} Redirect URL after reset
 */
export async function requestProfileReset() {
    try {
        const csrfToken = getCsrfToken();
        
        // Send the request to the server
        const response = await fetch('/req/profile/reset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-TOKEN': csrfToken
            },
        });

        // Handle the server response
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Server Error:', errorData.error);
            throw new Error(`Server Error: ${errorData.error}`);
        }

        const data = await response.json();
        if (data.success) {
            // Use window.location for client-side redirect
            if (typeof window !== 'undefined') {
                window.location.href = data.redirectUri;
            }
            
            return data.redirectUri;
        } else {
            throw new Error('Failed to reset profile');
        }
    } catch (error) {
        console.error('Error resetting profile:', error);
        throw error;
    }
}

/**
 * Gets CSRF token from meta tag or session storage
 * @returns {string} CSRF token
 * @private
 */
function getCsrfToken() {
    // Try to get from meta tag
    if (typeof document !== 'undefined') {
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        if (metaTag) {
            return metaTag.getAttribute('content');
        }
    }
    
    // Try to get from session storage
    if (typeof sessionStorage !== 'undefined') {
        const token = sessionStorage.getItem('csrf-token');
        if (token) {
            return token;
        }
    }
    
    console.warn("CSRF token not found");
    return '';
}