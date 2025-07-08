<?php
declare(strict_types=1);


namespace Hawk\HawkiCrypto\Tests;


use Hawk\HawkiCrypto\AsymmetricCrypto;
use Hawk\HawkiCrypto\HybridCrypto;
use Hawk\HawkiCrypto\SymmetricCrypto;
use Hawk\HawkiCrypto\Value\AsymmetricKeypair;
use Hawk\HawkiCrypto\Value\AsymmetricPublicKey;
use Hawk\HawkiCrypto\Value\HybridCryptoValue;
use Hawk\HawkiCrypto\Value\SymmetricCryptoValue;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

#[CoversClass(HybridCrypto::class)]
class HybridCryptoTest extends TestCase
{
    public function testItInstantiates(): void
    {
        $sut = new HybridCrypto(
            $this->createStub(SymmetricCrypto::class),
            $this->createStub(AsymmetricCrypto::class)
        );
        $this->assertInstanceOf(HybridCrypto::class, $sut);
    }

    public function testItForwardsGenerateKeypairToAsymmetricCrypto(): void
    {
        $keypair = $this->createMock(AsymmetricKeypair::class);
        $asymmetricCrypto = $this->createMock(AsymmetricCrypto::class);
        $asymmetricCrypto->expects($this->once())
            ->method('generateKeypair')
            ->willReturn($keypair);
        $sut = new HybridCrypto(
            $this->createStub(SymmetricCrypto::class),
            $asymmetricCrypto
        );

        $this->assertSame($keypair, $sut->generateKeypair());
    }

    public function testItEncrypts(): void
    {
        $plaintext = 'Hello, World!';
        $passPhraseToEncrypt = 'data';
        $symmetricCrypto = $this->createMock(SymmetricCrypto::class);
        $symmetricCrypto->expects($this->once())
            ->method('generatePassphrase')
            ->willReturn($passPhraseToEncrypt);
        $ciphertext = 'symmetric-encrypted-data';
        $symmetricValue = new SymmetricCryptoValue(
            iv: 'iv-value',
            tag: 'tag-value',
            ciphertext: $ciphertext
        );

        $symmetricCrypto->expects($this->once())
            ->method('encrypt')
            ->with($plaintext, $passPhraseToEncrypt)
            ->willReturn($symmetricValue);
        $publicKey = $this->createStub(AsymmetricPublicKey::class);
        $asymCrypto = $this->createMock(AsymmetricCrypto::class);
        $encryptedPassphrase = 'encrypted-passphrase';
        $asymCrypto->expects($this->once())
            ->method('encrypt')
            ->with($passPhraseToEncrypt, $publicKey)
            ->willReturn($encryptedPassphrase);

        $sut = new HybridCrypto(
            $symmetricCrypto,
            $asymCrypto
        );

        $value = $sut->encrypt($plaintext, $publicKey);
        $this->assertEquals($symmetricValue, $value->value);
        $this->assertEquals($encryptedPassphrase, $value->passphrase);
    }

    public function testItDecrypts(): void
    {
        $decryptedData = 'decrypted-data';
        $encryptedPassphrase = 'encrypted-passphrase';
        $passphrase = 'decrypted-passphrase';
        $privateKey = 'private';
        $symValue = $this->createStub(SymmetricCryptoValue::class);

        $value = new HybridCryptoValue(
            $encryptedPassphrase,
            $symValue
        );

        $asymmetricCrypto = $this->createMock(AsymmetricCrypto::class);
        $asymmetricCrypto->expects($this->once())
            ->method('decrypt')
            ->with($encryptedPassphrase, $privateKey)
            ->willReturn($passphrase);

        $symmetricCrypto = $this->createMock(SymmetricCrypto::class);
        $symmetricCrypto->expects($this->once())
            ->method('decrypt')
            ->with($symValue, $passphrase)
            ->willReturn($decryptedData);

        $sut = new HybridCrypto(
            $symmetricCrypto,
            $asymmetricCrypto
        );

        $this->assertSame($decryptedData, $sut->decrypt($value, $privateKey));
    }
}
