# Getting Started

Welcome to `hawki-client`! This guide will walk you through the essential steps to install the library and integrate it into your application. You'll learn how to connect to a HAWKI backend and start building applications with secure, real-time communication.

## Overview

The `hawki-client` is a JavaScript library designed to connect to a HAWKI backend, enabling developers to build applications with **secure, real-time communication**. Its core functionality includes chat room management, end-to-end encryption for messages, and local data persistence for offline access.

The library is built on a *reactive programming model*, making it easy to create dynamic user interfaces that automatically update when data changes. Instead of manually fetching and updating data, you can "subscribe" to data stores, and your UI will react to changes seamlessly.

The client is organized into logical categories called **Features**. Each feature is a property on the client object that deals with a specific area of functionality:

*   `client.rooms`: Manage chat rooms, members, and messages.
*   `client.users`: Find and interact with other users.
*   `client.profile`: Manage the current user's profile information.
*   `client.ai`: Integrate with HAWKI's AI capabilities.

## Installation Instructions

Before you begin, ensure you have Node.js and a package manager like npm, yarn, or pnpm installed.

To install `hawki-client`, run the following command in your project's root directory:

```bash
npm install @hawk-hhg/hawki-client
```

Alternatively, you can use Yarn or pnpm:

```bash
# With Yarn
yarn add @hawk-hhg/hawki-client

# With pnpm
pnpm add @hawk-hhg/hawki-client
```

## Usage Example

Everything starts with creating a client instance using the `createHawkiClient` function. A crucial option is `type`, which determines how the client authenticates and connects.

*   `type: 'external'`: For third-party applications. This is the most common use case and requires a dedicated backend to securely handle credentials.
*   `type: 'internal'`: For use directly within the HAWKI platform's own frontend.

### Option 1: Connecting an External Application (Recommended)

To use `hawki-client` in your own application, you **must** have a dedicated backend. This backend acts as a secure bridge, managing secret keys and brokering the connection between your frontend and the HAWKI server.

#### Step 1: Set Up Your Backend Endpoint

Your backend is responsible for communicating with the HAWKI API. It will receive a public key from your frontend, use your app's secret credentials to get a configuration from HAWKI, and send back an encrypted payload.

A ready-made PHP implementation is available at `hawki-client-backend-php`. Here is a basic example of an API endpoint (e.g., `/api/hawki-config`) using this library:

```php
<?php
// api/hawki-config.php
require_once __DIR__ . '/../vendor/autoload.php';

use Hawk\HawkiClientBackend\HawkiClientBackend;

// 1. Identify the user from your application's session
// In a real app, you would get this from your authentication system.
$localUserId = 'UNIQUE_USER_ID_FROM_YOUR_APP';

// 2. Get the frontend's public key from the POST request
$frontendPublicKey = $_POST['public_key'] ?? null;
if (!$frontendPublicKey) {
    header('HTTP/1.1 400 Bad Request');
    exit('Frontend public key is required.');
}

try {
    // 3. Instantiate the HawkiClientBackend with your secret credentials
    // Store these securely as environment variables!
    $hawkiClientBackend = new HawkiClientBackend(
        hawkiUrl: $_ENV['HAWKI_URL'],
        apiToken: $_ENV['HAWKI_API_TOKEN'],
        privateKey: $_ENV['HAWKI_APP_PRIVATE_KEY']
    );
    
    // 4. Get the encrypted configuration for the user
    $encryptedClientConfig = $hawkiClientBackend->getClientConfig(
        $localUserId,
        $frontendPublicKey
    );
    
    // 5. Send the secure payload back to the frontend
    header('Content-Type: application/json');
    echo json_encode($encryptedClientConfig);

} catch (\Throwable $e) {
    header('HTTP/1.1 500 Internal Server Error');
    exit('Failed to retrieve HAWKI configuration.');
}
```

> For a complete, runnable example, check out the [hawki-client-example](https://github.com/hawk-digital-environments/hawki-client-example) and [hawki-client-backend-php](https://github.com/hawk-digital-environments/hawki-client-backend-php) repositories.

#### Step 2: Initialize the Client in Your Frontend

In your JavaScript code, you can now create the client. It will call the backend endpoint you just created.

```javascript
import { createHawkiClient, createDebugLogger } from '@hawk-hhg/hawki-client';

async function initializeClient() {
  try {
    const client = await createHawkiClient({
      type: 'external',
      
      // The URL of the backend endpoint you created in Step 1.
      clientConfigUrl: '/api/hawki-config',

      // This function is called if the user needs to approve the connection.
      // You should show the `connectionUrl` to the user (e.g., as a link or QR code).
      onConnectionRequired: async (connectionUrl) => {
        // Example: Render a link for the user to click.
        // In a real app, you might show a modal with a QR code.
        const app = document.getElementById('app');
        app.innerHTML = `
          <p>Please connect your HAWKI account to continue.</p>
          <a href="${connectionUrl}" target="_blank">Click here to approve the connection</a>
          <p>After approving, this page will automatically update.</p>
        `;

        // This promise should not resolve, as the page will eventually
        // be reloaded or the client will reconnect automatically after approval.
        return new Promise(() => {});
      },

      // (Optional) Enable detailed logging for debugging.
      logger: createDebugLogger(),
    });

    console.log('HAWKI client connected successfully!');

    // You can now use the client's features.
    const currentUser = await client.profile.me().getAsync();
    console.log(`Logged in as: ${currentUser.displayName}`);

  } catch (error) {
    console.error('Failed to initialize HAWKI client:', error);
  }
}

initializeClient();
```

### Option 2: Connecting an Internal Application

This connection type is intended only for development *within the HAWKI platform's own frontend*. It bypasses the backend broker flow and instead requires the user to provide their passkey (password) directly to decrypt their data.

```javascript
import { createHawkiClient } from '@hawk-hhg/hawki-client';

const client = await createHawkiClient({
  type: 'internal',

  // This function must be provided to get the user's secret passkey.
  // In a real app, you would show a login form to get this value.
  providePasskey: () => {
    return window.prompt('Please enter your HAWKI passkey:');
  }
});

console.log('Internal HAWKI client is ready!');
```

## Scripts

This project includes the following scripts defined in `package.json` for building the library:

*   **Build the project:**
    This command compiles the TypeScript source code into distributable JavaScript files in the `dist/` directory.

    ```bash
    npm run build
    ```

*   **Watch for changes and rebuild:**
    This is useful during development. It will automatically rebuild the project whenever you make changes to the source files.

    ```bash
    npm run watch
    ```

## Cloning the Repository

If you want to contribute to the development of `hawki-client`, you'll need to clone the repository from GitHub. This project uses an SSH URL, so you'll need to have an SSH key configured with your GitHub account.

1.  **Clone the repository:**
    ```bash
    git clone git@github.com:hawk-digital-environments/hawki-package.git
    cd hawki-package
    ```

2.  **Set up the local development environment:**
    The project uses Docker and a helper script `bin/env` to ensure a consistent development environment.

    *   **Install dependencies and set up the environment (first time):**
        ```bash
        ./bin/env install
        ```

    *   **Start the development containers:**
        ```bash
        ./bin/env up
        ```

    You can now run commands within the containerized environment, for example `npm` commands:
    ```bash
    ./bin/env npm install
    ./bin/env npm run build
    ```

## [bin/env - Your Local Dev Helper](bin-env-your-local-dev-helper-862670637.md)

With your development environment up and running, you're ready to dive deeper into the tool that makes it all possible: the `bin/env` script. In the next chapter, we'll explore how this versatile helper streamlines your workflow, ensuring everything stays consistent and efficient from setup to deployment. Get ready to unlock the full potential of your local development toolkit!


