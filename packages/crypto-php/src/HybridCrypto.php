<?php
declare(strict_types=1);


namespace Hawk\HawkiCrypto;


use Hawk\HawkiCrypto\Value\AsymmetricKeypair;
use Hawk\HawkiCrypto\Value\AsymmetricPublicKey;
use Hawk\HawkiCrypto\Value\HybridCryptoValue;

readonly class HybridCrypto
{
    public function __construct(
        protected SymmetricCrypto  $symmetricCrypto,
        protected AsymmetricCrypto $asymmetricCrypto
    )
    {
    }

    /**
     * An alias of {@see AsymmetricCrypto::generateKeypair()}.
     * @return AsymmetricKeypair
     */
    public function generateKeypair(): AsymmetricKeypair
    {
        return $this->asymmetricCrypto->generateKeypair();
    }

    /**
     * Uses the best of both worlds: symmetric encryption for the data and asymmetric encryption for the passphrase.
     * This allows for efficient encryption of large data while maintaining the security of the passphrase.
     * @param string $data
     * @param AsymmetricPublicKey $publicKey
     * @return HybridCryptoValue
     */
    public function encrypt(string $data, AsymmetricPublicKey $publicKey): HybridCryptoValue
    {
        $passphrase = $this->symmetricCrypto->generatePassphrase();
        $symmetricValue = $this->symmetricCrypto->encrypt($data, $passphrase);
        $encryptedPassphrase = $this->asymmetricCrypto->encrypt($passphrase, $publicKey);
        return new HybridCryptoValue(
            passphrase: $encryptedPassphrase,
            value: $symmetricValue
        );
    }

    /**
     * Decrypts the hybrid encrypted value using the provided private key.
     * This method first decrypts the passphrase using the private key, then uses that passphrase to decrypt the symmetric value.
     *
     * @param HybridCryptoValue $value
     * @param string $privateKey
     * @return string The decrypted data.
     */
    public function decrypt(HybridCryptoValue $value, string $privateKey): string
    {
        $passphrase = $this->asymmetricCrypto->decrypt($value->passphrase, $privateKey);
        return $this->symmetricCrypto->decrypt($value->value, $passphrase);
    }
}
