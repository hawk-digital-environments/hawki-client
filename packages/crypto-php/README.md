# HAWKI Crypto PHP

A PHP library for cryptographic operations including symmetric, asymmetric, and hybrid encryption/decryption.

## Installation

```bash
composer require hawk-hhg/hawki-crypto
```

## Features

- **Symmetric Cryptography**: Encrypt and decrypt data using a shared secret key
- **Asymmetric Cryptography**: Public/private key encryption for secure communication
- **Hybrid Cryptography**: Combines symmetric and asymmetric approaches for efficient secure communication

## Usage

### Symmetric Encryption

```php
use Hawk\HawkiCrypto\SymmetricCrypto;

// Create instance
$crypto = new SymmetricCrypto();

// Encrypt data
$encrypted = $crypto->encrypt("sensitive data", "your-secret-key");

// Decrypt data
$decrypted = $crypto->decrypt($encrypted, "your-secret-key");
```

### Asymmetric Encryption

```php
use Hawk\HawkiCrypto\AsymmetricCrypto;
use Hawk\HawkiCrypto\Value\AsymmetricKeypair;

// Create instance
$crypto = new AsymmetricCrypto();

// Generate keypair
$keypair = $crypto->generateKeypair();

// Encrypt with public key
$encrypted = $crypto->encrypt("sensitive data", $keypair->getPublicKey());

// Decrypt with private key
$decrypted = $crypto->decrypt($encrypted, $keypair);
```

### Hybrid Encryption

```php
use Hawk\HawkiCrypto\HybridCrypto;
use Hawk\HawkiCrypto\SymmetricCrypto;
use Hawk\HawkiCrypto\AsymmetricCrypto;
use Hawk\HawkiCrypto\Value\AsymmetricKeypair;

// Create required instances
$hybridCrypto = new HybridCrypto(new SymmetricCrypto(), new AsymmetricCrypto());

// Generate keypair
$keypair = $asymmetricCrypto->generateKeypair();

// Encrypt with public key
$encrypted = $hybridCrypto->encrypt("sensitive data", $keypair->getPublicKey());

// Decrypt with private key
$decrypted = $hybridCrypto->decrypt($encrypted, $keypair);
```

## Value Objects

The library provides several value objects for handling cryptographic operations:

- `AsymmetricKeypair`: Represents a public/private key pair
- `AsymmetricPublicKey`: Represents a public key
- `SymmetricCryptoValue`: Encapsulates symmetrically encrypted data
- `HybridCryptoValue`: Encapsulates hybrid encrypted data

All value objects can be serialized as JSON strings for easy storage and transmission like so:

```php
use Hawk\HawkiCrypto\AsymmetricCrypto;

$crypto = new AsymmetricCrypto();

echo json_encode($crypto->generateKeypair()); // Outputs JSON representation of the keypair
```

Alternatively every value object can be cast into a string and recreated from it:

```php
use Hawk\HawkiCrypto\AsymmetricCrypto;

$crypto = new AsymmetricCrypto();
$keypair = $crypto->generateKeypair();

echo (string) $keypair; // Outputs string representation of the keypair

$keypairFromString = AsymmetricKeypair::fromString((string) $keypair); // Recreates keypair from string
```

## Exception Handling

The library throws exceptions that implement `HawkiCryptoExceptionInterface` when errors occur.
