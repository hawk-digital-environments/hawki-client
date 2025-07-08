<?php
declare(strict_types=1);


namespace Hawk\HawkiCrypto\Tests;

use Hawk\HawkiCrypto\SymmetricCrypto;
use Hawk\HawkiCrypto\Value\SymmetricCryptoValue;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

#[CoversClass(SymmetricCrypto::class)]
class SymmetricCryptoTest extends TestCase
{
    public function testItCanGenerateARandomPassphrase(): void
    {
        $sut = new SymmetricCrypto();
        $passphrase = $sut->generatePassphrase();
        $this->assertIsString($passphrase);
        $this->assertNotEmpty($passphrase);
        $this->assertEquals(64, strlen($passphrase));
    }

    public function testItCanEncryptAndDecrypt(): void
    {
        $sut = new SymmetricCrypto();
        $passphrase = $sut->generatePassphrase();

        $plaintext = 'This is a test message.';
        $encrypted = $sut->encrypt(
            plaintext: $plaintext,
            passphrase: $passphrase
        );
        $this->assertInstanceOf(SymmetricCryptoValue::class, $encrypted);
        $this->assertNotEmpty($encrypted->ciphertext);
        $this->assertNotEquals($encrypted->ciphertext, $plaintext);
        $decrypted = $sut->decrypt(
            value: $encrypted,
            passphrase: $passphrase
        );

        $this->assertSame($plaintext, $decrypted);
    }

}
