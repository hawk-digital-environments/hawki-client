# hawki-client

[![npm version](https://img.shields.io/npm/v/@hawk-hhg/hawki-client.svg)](https://www.npmjs.com/package/@hawk-hhg/hawki-client)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

Welcome to `hawki-client`! This is a JavaScript library designed to connect to a HAWKI backend, enabling developers to
build applications with **secure, real-time communication**. Its core functionality includes chat room management,
end-to-end encryption for messages, and local data persistence. The library is built on a *reactive programming model*,
making it easy to create dynamic user interfaces that automatically update when data changes.

## Features

* **Secure Real-Time Communication**: Build applications with instant, secure data exchange.
* **End-to-End Encryption**: Ensures that messages and data remain private between users.
* **Reactive Programming Model**: Create dynamic UIs that automatically update when data changes by subscribing to data
  stores.
* **Local Data Persistence**: Provides an offline-first experience by persisting data locally.
* **Comprehensive API Features**:
    * `client.rooms`: Manage chat rooms, members, and messages.
    * `client.users`: Find and interact with other users.
    * `client.profile`: Manage the current user's profile information.
    * `client.ai`: Integrate with HAWKI's AI capabilities.

## Getting Started

Follow these instructions to install and integrate `hawki-client` into your project.

### Installation

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

### Usage

Everything starts with creating a client instance using `createHawkiClient`. The recommended approach for third-party
applications is `type: 'external'`, which requires a dedicated backend to securely broker the connection.

This backend must handle your secret credentials and provide a configuration endpoint for your frontend. A ready-made
PHP implementation is available at [
`hawki-client-backend-php`](https://github.com/hawk-digital-environments/hawki-client-backend-php).

In your frontend JavaScript, you can initialize the client like this:

```javascript
import {createHawkiClient, createDebugLogger} from '@hawk-hhg/hawki-client';

async function initializeClient() {
    try {
        const client = await createHawkiClient({
            type: 'external',
            // The URL of the backend endpoint you created.
            clientConfigUrl: '/api/hawki-config',

            // This function is called if the user needs to approve the connection.
            // You should show the `connectionUrl` to the user (e.g., in a link or QR code).
            onConnectionRequired: async (connectionUrl) => {
                const app = document.getElementById('app');
                app.innerHTML = `
          <p>Please connect your HAWKI account to continue.</p>
          <a href="${connectionUrl}" target="_blank">Click here to approve the connection</a>
          <p>After approving, this page will automatically update.</p>
        `;
                // This promise should not resolve, as the client will reconnect automatically.
                return new Promise(() => {
                });
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

> For a complete, runnable example, check out
> the [hawki-client-example](https://github.com/hawk-digital-environments/hawki-client-example)
> and [hawki-client-backend-php](https://github.com/hawk-digital-environments/hawki-client-backend-php) repositories.
> For
> more detailed instructions, see the [Getting Started](docs/getting-started-929492837.md) guide.

## Development Setup (For Contributors)

If you want to contribute to `hawki-client` itself, you'll need to clone the repository and set up the local development
environment.

This project uses `bin/env`, a friendly helper tool that automates managing Docker containers and environment variables
to ensure a consistent setup.

1. **Clone the Repository**

   The project uses an SSH URL, so you'll need to have an SSH key configured with your GitHub account.
   ```bash
   git clone git@github.com:hawk-digital-environments/hawki-package.git
   cd hawki-package
   ```

2. **Install Environment Dependencies**

   This command sets up local domains, SSL certificates, and other initial configurations. You may be prompted for your
   admin password for system changes. This step is completely optional but helps when working with multiple projects.
   ```bash
   ./bin/env install
   ```

3. **Start the Development Environment**

   Use this command to launch all necessary services in Docker containers.
   ```bash
   ./bin/env up
   ```
   Add `-f` or `--attach` to monitor logs in your terminal.

4. **Run Project Scripts**

   Once the environment is up, use `bin/env` to run commands like `npm` inside the appropriate container. This ensures
   you are using the correct versions and configurations.

   ```bash
   # Install npm dependencies
   ./bin/env npm install

   # Build the project
   ./bin/env npm run build

   # Watch for changes and rebuild
   ./bin/env npm run watch
   ```

Other useful commands include `./bin/env stop` to pause services and `./bin/env down` to stop them completely. To learn
more, check out the full details in [bin/env - Your local dev helper](docs/bin-env-your-local-dev-helper-862670637.md).

## License

This project is licensed under the **Apache-2.0 License**. See the [LICENSE](LICENSE) file for details.

## Postcardware

You're free to use this package, but if it makes it to your production environment we highly appreciate you sending us a
postcard from your hometown, mentioning which of our package(s) you are using.

```
HAWK Fakultät Gestaltung
Interaction Design Lab
Renatastraße 11
31134 Hildesheim
```

Thank you :D
