<?php
declare(strict_types=1);


namespace Hawk\HawkiCrypto\Value;


use Hawk\HawkiCrypto\Exception\InvalidNumberOfStringPartsException;

readonly class HybridCryptoValue implements \Stringable, \JsonSerializable
{
    use StringableValueTrait;

    public function __construct(
        public string               $passphrase,
        public SymmetricCryptoValue $value
    )
    {
    }

    protected function toStringList(): array
    {
        return [$this->passphrase, (string)$this->value];
    }

    protected static function fromStringList(string ...$values): static
    {
        if (count($values) !== 2) {
            throw new InvalidNumberOfStringPartsException(static::class, 2, count($values));
        }

        return new static(
            $values[0],
            SymmetricCryptoValue::fromString($values[1])
        );
    }
}
