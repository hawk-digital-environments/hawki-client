
async function verifyEnteredPassKey(enteredKey){

    if (!enteredKey) {
        return {
            'success': false,
            'message': 'Key value can not be empty!'
        }
    }

    if(await verifyPasskey(enteredKey)){
        await setPassKey(enteredKey);
        await syncKeychain(serverKeychainCryptoData);
        // console.log('keychain synced');
        window.location.href = '/chat'; 
    }
    else{
        errorMessage.innerText = "Failed to verify passkey. Please try again.";
        setTimeout(() => {
            errorMessage.innerText = "";
        }, 10000);
    }

}

async function verifyPasskey(passkey) {
    try {
        const udSalt = await fetchServerSalt('USERDATA_ENCRYPTION_SALT');
        const keychainEncryptor = await deriveKey(passkey, "keychain_encryptor", udSalt);
    
        const { keychain, KCIV, KCTAG } = JSON.parse(serverKeychainCryptoData);
    
        const decryptedKeychain = await decryptWithSymKey(
            keychainEncryptor,
            keychain,
            KCIV,
            KCTAG,
            false
        );

        return true;
    } catch (error) {
        // You can log the error if needed
        // console.error("Error during verification or decryption:", error);
        return false;
    }
}


function uploadTextFile() {
    // Create a file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt'; // Accept only text files
    const msg = document.querySelector('#backup-alert-message');

    // Set up an event listener to handle the file once the user selects it
    input.addEventListener('change', function(event) {
        const file = event.target.files[0]; // Get the first selected file
        if (file) {
            const reader = new FileReader();
            // Once the file is read, invoke the callback with the file content
            reader.onload = function(e) {
                const content = e.target.result;  
                if (isValidBackupKeyFormat(content.trim())) {
                    document.querySelector('#backup-hash-input').value = content;
                } else {
                    msg.innerText = 'The file content does not match the required format.';
                }
            };
            // Read the file as text
            reader.readAsText(file);
        }
    });

    // Trigger the file input dialog
    input.click();
}


function isValidBackupKeyFormat(content) {
    // Define a regular expression to match the format xxxx-xxxx-xxxx-xxxx
    const pattern = /^[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}$/;
    return pattern.test(content);
}

async function extractPasskey(){
    const msg = document.querySelector('#backup-alert-message');
    const backupHash = document.querySelector('#backup-hash-input').value;
    if(!backupHash){
        msg.innerText = 'Enter backupHash or upload your backup file.';
        return;
    }
    if(!isValidBackupKeyFormat){
        msg.innerText = 'Backup key is not valid!';
        return;
    }

    // Get passkey backup from server.
    const passkeyBackup = await requestPasskeyBackup();
    if(!passkeyBackup){
        return;
    }

    // derive Key from entered backupkey
    const passkeyBackupSalt = await fetchServerSalt('BACKUP_SALT');
    const derivedKey = await deriveKey(backupHash, `${userInfo.username}_backup`, passkeyBackupSalt);
    // console.log(derivedKey);
    try{
        //encrypt Passkey as plaintext
        const passkey = await decryptWithSymKey(derivedKey, 
                                                passkeyBackup.ciphertext,
                                                passkeyBackup.iv,
                                                passkeyBackup.tag, 
                                                false);
                                                
        if(verifyPasskey(passkey)){
            setPassKey(passkey);
            switchSlide(3);
            document.querySelector('#passkey-field').innerText = passkey;
        }
        else{
            msg.innerText = "Failed to verify passkey";
        }
    }
    catch (error) {
        msg.innerText = 'Error decrypting passkey with backup code.';
        throw error;
    }

}


async function requestPasskeyBackup(){
        // Request passkey backup from server.
        try {
            const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
            // Send the registration data to the server
            const response = await fetch('/req/profile/requestPasskeyBackup', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    "X-CSRF-TOKEN": csrfToken
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
                const passKeyJson = data.passkeyBackup;
                return passKeyJson;
            }
    
        } catch (error) {
            console.error('Error downloading passkey backup:', error);
            throw error;
        }
}

async function redirectToChat(){
    await syncKeychain(serverKeychainCryptoData);
    window.location.href = '/chat'; 
}


async function requestProfileReset(){
    try {
        const csrfToken = document.querySelector('meta[name="csrf-token"]').getAttribute('content');
        // Send the registration data to the server
        const response = await fetch('/req/profile/reset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                "X-CSRF-TOKEN": csrfToken
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
            window.location.href = data.redirectUri;
        }

    } catch (error) {
        console.error('Error reseting profile:', error);
        throw error;
    }
}