<?php
declare(strict_types=1);


namespace Hawk\HawkiCrypto\Tests;


use Hawk\HawkiCrypto\Value\SymmetricCryptoValue;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

#[CoversClass(SymmetricCryptoValue::class)]
class SymmetricCryptoValueTest extends TestCase
{
    public function testItConstructs(): void
    {
        $sut = new SymmetricCryptoValue(
            iv: 'iv-value',
            tag: 'tag-value',
            ciphertext: 'ciphertext-value'
        );

        $this->assertSame('iv-value', $sut->iv);
        $this->assertSame('tag-value', $sut->tag);
        $this->assertSame('ciphertext-value', $sut->ciphertext);
    }

    public function testItCanBeConvertedToString(): void
    {
        $sut = new SymmetricCryptoValue(
            iv: 'iv-value',
            tag: 'tag-value',
            ciphertext: 'ciphertext-value'
        );

        $this->assertSame('aXYtdmFsdWU=|dGFnLXZhbHVl|Y2lwaGVydGV4dC12YWx1ZQ==', (string)$sut);
    }

    public function testItCanBeCreatedFromString(): void
    {
        $sut = SymmetricCryptoValue::fromString('"aXYtdmFsdWU=|dGFnLXZhbHVl|Y2lwaGVydGV4dC12YWx1ZQ=="');

        $this->assertInstanceOf(SymmetricCryptoValue::class, $sut);
        $this->assertSame('iv-value', $sut->iv);
        $this->assertSame('tag-value', $sut->tag);
        $this->assertSame('ciphertext-value', $sut->ciphertext);
    }

    public function testItCanBeJsonEncoded(): void
    {
        $sut = new SymmetricCryptoValue(
            iv: 'iv-value',
            tag: 'tag-value',
            ciphertext: 'ciphertext-value'
        );

        $json = json_encode($sut);
        $this->assertSame('"aXYtdmFsdWU=|dGFnLXZhbHVl|Y2lwaGVydGV4dC12YWx1ZQ=="', $json);
    }
}
