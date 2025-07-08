<?php
declare(strict_types=1);


namespace Hawk\HawkiCrypto\Value;


use Hawk\HawkiCrypto\Exception\InvalidNumberOfStringPartsException;
use Stringable;

readonly class AsymmetricKeypair implements Stringable, \JsonSerializable
{
    use StringableValueTrait;

    public string $privateKey;
    public AsymmetricPublicKey $publicKey;

    public function __construct(
        #[\SensitiveParameter]
        string              $privateKey,
        AsymmetricPublicKey $publicKey
    )
    {
        $this->privateKey = $privateKey;
        $this->publicKey = $publicKey;
    }

    protected function toStringList(): array
    {
        return [$this->privateKey, (string)$this->publicKey];
    }

    protected static function fromStringList(string ...$values): static
    {
        if (count($values) !== 2) {
            throw new InvalidNumberOfStringPartsException(static::class, 2, count($values));
        }

        return new static(
            $values[0],
            AsymmetricPublicKey::fromString($values[1])
        );
    }
}
