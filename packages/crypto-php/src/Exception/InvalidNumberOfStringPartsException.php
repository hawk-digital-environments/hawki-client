<?php
declare(strict_types=1);


namespace Hawk\HawkiCrypto\Exception;


class InvalidNumberOfStringPartsException extends \InvalidArgumentException implements HawkiCryptoExceptionInterface
{
    public function __construct(
        string $className,
        int    $expectedParts,
        int    $actualParts,
    )
    {
        parent::__construct(
            sprintf(
                'Invalid number of string parts to create an instance of %s: expected %d, got %d',
                $className,
                $expectedParts,
                $actualParts
            )
        );
    }
}
