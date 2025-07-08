<?php
declare(strict_types=1);


namespace Hawk\HawkiCrypto\Tests;


use Hawk\HawkiCrypto\Exception\InvalidNumberOfStringPartsException;
use Hawk\HawkiCrypto\Value\StringableValueTrait;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\CoversTrait;
use PHPUnit\Framework\TestCase;

#[CoversTrait(StringableValueTrait::class)]
#[CoversClass(InvalidNumberOfStringPartsException::class)]
class StringableValueTraitTest extends TestCase
{
    public function testItCanConvertObjectToString(): void
    {
        $sut = new class() {
            use StringableValueTrait;

            protected function toStringList(): array
            {
                return ['value1', 'value2'];
            }
        };

        $this->assertSame('dmFsdWUx|dmFsdWUy', (string)$sut);
    }

    public function testItCanCreateObjectFromString(): void
    {
        $sut = new class('value1', 'value2') {
            use StringableValueTrait;

            public string $a;
            public string $b;

            public function __construct($a, $b)
            {
                $this->a = $a;
                $this->b = $b;
            }

            protected function toStringList(): array
            {
                return [$this->a, $this->b];
            }
        };

        $newSut = $sut::fromString((string)$sut);
        $this->assertInstanceOf(get_class($sut), $newSut);
        $this->assertSame('dmFsdWUx|dmFsdWUy', (string)$newSut);
    }

    public function testItCanCreateObjectFromStringWithCustomFactory(): void
    {
        $sut = new class() {
            use StringableValueTrait;

            protected function toStringList(): array
            {
                return ['value1', 'value2'];
            }

            protected static function fromStringList(string ...$values): static
            {
                if ($values !== ['value1', 'value2']) {
                    throw new \InvalidArgumentException('Invalid values');
                }
                return new self();
            }
        };

        try {
            $i = $sut::fromString((string)$sut);
            $this->assertInstanceOf(get_class($sut), $i);
        } catch (\Throwable) {
            $this->fail('The custom factory should not throw an exception');
        }
    }

    public function testItFailsToCreateObjectFromStringWithNotEnoughParts(): void
    {
        $sut = new class('a', 'b') {
            use StringableValueTrait;

            public function __construct(string $a, string $b)
            {
            }

            protected function toStringList(): array
            {
                return [];
            }
        };

        $this->expectException(InvalidNumberOfStringPartsException::class);
        $sut::fromString('asdf');
    }

    public function testItCanBeJsonSerialized(): void
    {
        $sut = new class() implements \JsonSerializable {
            use StringableValueTrait;

            protected function toStringList(): array
            {
                return ['value1', 'value2'];
            }
        };

        $this->assertSame('"dmFsdWUx|dmFsdWUy"', json_encode($sut));
    }

}
