<?php
declare(strict_types=1);


namespace Hawk\HawkiCrypto\Tests;


use Hawk\HawkiCrypto\AsymmetricCrypto;
use Hawk\HawkiCrypto\Value\AsymmetricKeypair;
use Hawk\HawkiCrypto\Value\AsymmetricPublicKey;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

#[CoversClass(AsymmetricCrypto::class)]
class AsymmetricCryptoTest extends TestCase
{
    public function testItCanGenerateAKeypair(): void
    {
        $sut = new AsymmetricCrypto();
        $keypair = $sut->generateKeypair();
        $this->assertInstanceOf(AsymmetricKeypair::class, $keypair);
        $this->assertNotEmpty($keypair->privateKey);
        $this->assertInstanceOf(AsymmetricPublicKey::class, $keypair->publicKey);
        $this->assertNotEmpty($keypair->publicKey->server);
        $this->assertNotEmpty($keypair->publicKey->web);
        $this->assertNotSame(
            $keypair->publicKey->server,
            $keypair->publicKey->web
        );
    }

    public function testItCanEncryptAndDecrypt(): void
    {
        $sut = new AsymmetricCrypto();
        $keypair = $sut->generateKeypair();

        $plaintext = 'This is a test message.';
        $encrypted = $sut->encrypt(
            plaintext: $plaintext,
            publicKey: $keypair->publicKey
        );

        $this->assertNotEmpty($encrypted);

        $decrypted = $sut->decrypt(
            data: $encrypted,
            privateKey: $keypair->privateKey
        );

        $this->assertSame($plaintext, $decrypted);
    }

}
