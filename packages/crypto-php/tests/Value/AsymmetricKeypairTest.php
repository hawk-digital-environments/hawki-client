<?php
declare(strict_types=1);


namespace Hawk\HawkiCrypto\Tests;


use Hawk\HawkiCrypto\Value\AsymmetricKeypair;
use Hawk\HawkiCrypto\Value\AsymmetricPublicKey;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;

#[CoversClass(AsymmetricKeypair::class)]
class AsymmetricKeypairTest extends TestCase
{
    protected AsymmetricKeypair $sut;

    protected function setUp(): void
    {
        $this->sut = new AsymmetricKeypair(
            privateKey: 'private-key',
            publicKey: new AsymmetricPublicKey(
                server: 'server-key',
                web: 'web-key'
            )
        );
    }

    public function testItCanBeConstructed(): void
    {
        $sut = new AsymmetricKeypair(
            privateKey: 'private-key',
            publicKey: $this->createStub(AsymmetricPublicKey::class)
        );
        $this->assertInstanceOf(AsymmetricKeypair::class, $sut);
    }

    public function testItCanBeConvertedToString(): void
    {
        $this->assertSame('cHJpdmF0ZS1rZXk=|YzJWeWRtVnlMV3RsZVE9PXxkMlZpTFd0bGVRPT0=', (string)$this->sut);
    }

    public function testItCanBeCreatedFromString(): void
    {
        $sut = AsymmetricKeypair::fromString('cHJpdmF0ZS1rZXk=|YzJWeWRtVnlMV3RsZVE9PXxkMlZpTFd0bGVRPT0=');

        $this->assertInstanceOf(AsymmetricKeypair::class, $sut);
        $this->assertSame('server-key', $sut->publicKey->server);
        $this->assertSame('web-key', $sut->publicKey->web);
    }

    public function testItCanBeJsonEncoded(): void
    {
        $json = json_encode($this->sut);
        $this->assertSame('"cHJpdmF0ZS1rZXk=|YzJWeWRtVnlMV3RsZVE9PXxkMlZpTFd0bGVRPT0="', $json);
    }
}
