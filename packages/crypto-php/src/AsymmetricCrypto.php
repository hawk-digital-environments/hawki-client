<?php
declare(strict_types=1);


namespace Hawk\HawkiCrypto;


use Hawk\HawkiCrypto\Value\AsymmetricKeypair;
use Hawk\HawkiCrypto\Value\AsymmetricPublicKey;
use phpseclib3\Crypt\RSA;
use phpseclib3\Crypt\RSA\PublicKey;

readonly class AsymmetricCrypto
{
    /**
     * Generates a new RSA keypair.
     *
     * @return AsymmetricKeypair
     */
    public function generateKeypair(): AsymmetricKeypair
    {
        $privateKey = RSA::createKey(4096);
        $publicKey = $privateKey->getPublicKey();

        $publicKeyString = $publicKey->toString('PKCS8');

        return new AsymmetricKeypair(
            privateKey: base64_encode($privateKey->toString('PKCS8')),
            publicKey: new AsymmetricPublicKey(
                server: base64_encode($publicKeyString),
                web: preg_replace('~-+BEGIN PUBLIC KEY-+|-+END PUBLIC KEY-+|\s~', '', $publicKeyString)
            )
        );
    }

    /**
     * Encrypts data using the provided public key.
     * This method uses the RSA public key to encrypt the data.
     *
     * @param string $plaintext The data to encrypt.
     * @param AsymmetricPublicKey $publicKey The public key to use for encryption.
     * @return string The ciphertext, base64-encoded.
     */
    public function encrypt(string $plaintext, AsymmetricPublicKey $publicKey): string
    {
        /** @var PublicKey $rsa */
        $rsa = RSA::load(base64_decode($publicKey->server));
        return base64_encode($rsa->encrypt($plaintext));
    }

    /**
     * Decrypts data using the provided private key.
     * This method uses the RSA private key to decrypt the data.
     *
     * @param string $data The ciphertext to decrypt, base64-encoded.
     * @param string $privateKey The private key to use for decryption, base64-encoded.
     * @return string The decrypted plaintext.
     */
    public function decrypt(
        string $data,
        #[\SensitiveParameter]
        string $privateKey
    ): string
    {
        /** @var RSA\PrivateKey $rsa */
        $rsa = RSA::load(base64_decode($privateKey));
        return $rsa->decrypt(base64_decode($data));
    }
}
