<?php
declare(strict_types=1);


namespace Hawk\HawkiCrypto\Tests;


use Hawk\HawkiCrypto\Exception\InvalidNumberOfStringPartsException;
use Hawk\HawkiCrypto\Value\HybridCryptoValue;
use Hawk\HawkiCrypto\Value\SymmetricCryptoValue;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

#[CoversClass(HybridCryptoValue::class)]
class HybridCryptoValueTest extends TestCase
{
    public function testItConstructs(): void
    {
        $passphrase = 'encrypted-passphrase';
        $value = $this->createStub(SymmetricCryptoValue::class);
        $sut = new HybridCryptoValue(
            passphrase: $passphrase,
            value: $value
        );

        $this->assertSame($passphrase, $sut->passphrase);
        $this->assertSame($value, $sut->value);
    }

    public function testItCanBeConvertedToString(): void
    {
        $value = new SymmetricCryptoValue(
            iv: 'iv-value',
            tag: 'tag-value',
            ciphertext: 'ciphertext-value'
        );
        $sut = new HybridCryptoValue(
            passphrase: 'encrypted-passphrase',
            value: $value
        );
        $this->assertSame(
            'ZW5jcnlwdGVkLXBhc3NwaHJhc2U=|YVhZdGRtRnNkV1U9fGRHRm5MWFpoYkhWbHxZMmx3YUdWeWRHVjRkQzEyWVd4MVpRPT0=',
            (string)$sut
        );
    }

    public function testItCanBeCreatedFromString(): void
    {
        $sut = HybridCryptoValue::fromString(
            'ZW5jcnlwdGVkLXBhc3NwaHJhc2U=|YVhZdGRtRnNkV1U9fGRHRm5MWFpoYkhWbHxZMmx3YUdWeWRHVjRkQzEyWVd4MVpRPT0='
        );

        $this->assertInstanceOf(HybridCryptoValue::class, $sut);
        $this->assertSame('encrypted-passphrase', $sut->passphrase);
        $this->assertInstanceOf(SymmetricCryptoValue::class, $sut->value);
    }

    public function testItFailsToBeCreatedFromStringWithNotEnoughParts(): void
    {
        $this->expectException(InvalidNumberOfStringPartsException::class);
        HybridCryptoValue::fromString(
            'asdf'
        );
    }

    public function testItCanBeJsonEncoded(): void
    {
        $value = new SymmetricCryptoValue(
            iv: 'iv-value',
            tag: 'tag-value',
            ciphertext: 'ciphertext-value'
        );
        $sut = new HybridCryptoValue(
            passphrase: 'encrypted-passphrase',
            value: $value
        );
        $json = json_encode($sut);
        $this->assertSame('"ZW5jcnlwdGVkLXBhc3NwaHJhc2U=|YVhZdGRtRnNkV1U9fGRHRm5MWFpoYkhWbHxZMmx3YUdWeWRHVjRkQzEyWVd4MVpRPT0="', $json);
    }


}
