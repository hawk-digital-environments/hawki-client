import {
    decryptSymmetric,
    encryptSymmetric,
    generateSymmetricKey,
    loadSymmetricCryptoValue,
    type SymmetricCryptoValue
} from './symmetric.js';
import {decryptKeyAsymmetric, encryptKeyAsymmetric} from './asymmetric.js';

export interface HybridCryptoValue {
    passphrase: string;
    value: SymmetricCryptoValue,
    toString: () => string;
}

/**
 * Internal helper function to create a HybridCryptoValue object.
 * @param passphrase
 * @param value
 */
function createHybridCryptoValue(passphrase: string, value: SymmetricCryptoValue): HybridCryptoValue {
    return {
        passphrase,
        value,
        toString: function () {
            return [this.passphrase, this.value.toString()].map(v => btoa(v)).join('|');
        }
    };
}

/**
 * Loads a HybridCryptoValue from a form generated when calling toString on a HybridCryptoValue.
 * @param ciphertext
 */
export function loadHybridCryptoValue(ciphertext: string): HybridCryptoValue {
    const cipherParts = ciphertext.split('|');
    if (cipherParts.length !== 2) {
        throw new Error('Invalid hybrid ciphertext format');
    }
    return createHybridCryptoValue(
        atob(cipherParts[0]),
        loadSymmetricCryptoValue(atob(cipherParts[1]))
    );
}

/**
 * Uses the best of both worlds: symmetric encryption for the data and asymmetric encryption for the passphrase.
 * This allows for efficient encryption of large data while maintaining the security of the passphrase.
 * @param plaintext - The plaintext to encrypt
 * @param publicKey - The asymmetric public key to use for encrypting the passphrase
 */
export async function encryptHybrid(plaintext: string, publicKey: CryptoKey): Promise<HybridCryptoValue> {
    const key = await generateSymmetricKey();
    // This value would be assignable to: \App\Services\Crypto\Value\HybridCryptoValue
    return createHybridCryptoValue(
        await encryptKeyAsymmetric(key, publicKey),
        await encryptSymmetric(plaintext, key)
    );
}

/**
 * Decrypts the hybrid encrypted value using the provided private key.
 * This method first decrypts the passphrase using the private key, then uses that passphrase to decrypt the symmetric value.
 * @param value - The value to decrypt
 * @param privateKey - The private key to use for decryption
 */
export async function decryptHybrid(value: HybridCryptoValue, privateKey: CryptoKey): Promise<string> {
    return await decryptSymmetric(
        value.value,
        await decryptKeyAsymmetric(value.passphrase, privateKey)
    );
}
