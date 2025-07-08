<?php
declare(strict_types=1);


namespace Hawk\HawkiCrypto\Value;


use Hawk\HawkiCrypto\Exception\InvalidNumberOfStringPartsException;

trait StringableValueTrait
{
    /**
     * MUST return a list of strings that will be used to serialize the object into a string.
     * @return list<string>
     */
    abstract protected function toStringList(): array;

    /**
     * Receives a list of strings that were used to serialize the object into a string.
     * The order is the same as the one returned by `toStringList()`.
     * @param string ...$values
     * @return mixed
     * @throws InvalidNumberOfStringPartsException if the number of values does not match the expected constructor arguments
     */
    protected static function fromStringList(string ...$values): static
    {
        $constructor = (new \ReflectionClass(static::class))->getConstructor();
        if (count($values) !== $constructor->getNumberOfRequiredParameters()) {
            throw new InvalidNumberOfStringPartsException(static::class, $constructor->getNumberOfRequiredParameters(), count($values));
        }

        return new static(...$values);
    }

    final public function __toString(): string
    {
        return implode('|', array_map('base64_encode', $this->toStringList()));
    }

    final public static function fromString(string $value): static
    {
        return static::fromStringList(...array_map('base64_decode', explode('|', $value)));
    }

    final public function jsonSerialize(): string
    {
        return $this->__toString();
    }
}
