<?php
declare(strict_types=1);


namespace Hawk\HawkiCrypto\Value;


readonly class AsymmetricPublicKey implements \Stringable, \JsonSerializable
{
    use StringableValueTrait;

    public string $server;
    public string $web;

    public function __construct(
        string $server,
        string $web
    )
    {
        $this->server = $server;
        $this->web = $web;
    }

    protected function toStringList(): array
    {
        return [$this->server, $this->web];
    }
}
