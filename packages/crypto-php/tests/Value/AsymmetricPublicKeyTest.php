<?php
declare(strict_types=1);


namespace Hawk\HawkiCrypto\Tests;


use Hawk\HawkiCrypto\Value\AsymmetricPublicKey;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

#[CoversClass(AsymmetricPublicKey::class)]
class AsymmetricPublicKeyTest extends TestCase
{
    public function testItConstructs(): void
    {
        $sut = new AsymmetricPublicKey(
            server: 'server-key',
            web: 'web-key'
        );
        $this->assertSame('server-key', $sut->server);
        $this->assertSame('web-key', $sut->web);
    }

    public function testItCanBeConvertedToString(): void
    {
        $sut = new AsymmetricPublicKey(
            server: 'server-key',
            web: 'web-key'
        );
        $this->assertSame('c2VydmVyLWtleQ==|d2ViLWtleQ==', (string)$sut);
    }

    public function testItCanBeCreatedFromString(): void
    {
        $sut = AsymmetricPublicKey::fromString('c2VydmVyLWtleQ==|d2ViLWtleQ==');
        $this->assertInstanceOf(AsymmetricPublicKey::class, $sut);
        $this->assertSame('server-key', $sut->server);
        $this->assertSame('web-key', $sut->web);
    }

    public function testItCanBeJsonEncoded(): void
    {
        $sut = new AsymmetricPublicKey(
            server: 'server-key',
            web: 'web-key'
        );
        $json = json_encode($sut);
        $this->assertSame('"c2VydmVyLWtleQ==|d2ViLWtleQ=="', $json);
    }
}
