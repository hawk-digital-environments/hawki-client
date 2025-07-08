<?php
declare(strict_types=1);


namespace Hawk\HawkiCrypto\Value;


readonly class SymmetricCryptoValue implements \Stringable, \JsonSerializable
{
    use StringableValueTrait;

    public function __construct(
        public string $iv,
        public string $tag,
        public string $ciphertext,
    )
    {
    }

    protected function toStringList(): array
    {
        return [$this->iv, $this->tag, $this->ciphertext];
    }
}
