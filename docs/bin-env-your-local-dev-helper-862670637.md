# bin/env - Your local dev helper

Following the foundational setup and understanding of the project outlined in [Getting Started](getting-started-929492837.md), we'll now explore bin/env, a local development helper that simplifies your coding environment. This tool builds directly on the installation steps from the previous chapter, allowing you to customize and optimize your workflow with ease. Let's dive into how bin/env integrates seamlessly into your development process.  
 
The bin/env program is designed to make local development straightforward and efficient...

# `bin/env` - Your local dev helper

## Overview

`bin/env` is a command-line helper program designed to streamline the local development workflow for the `hawki-client` project. It automates common tasks such as managing environment variables, running the Docker environment, and executing project-specific scripts.

The tool is built with Node.js and TypeScript, but it is completely self-contained. It automatically downloads and uses its own specific version of Node.js and manages its own dependencies, meaning you don't need to have Node.js or any specific version of it installed on your system to use it. This ensures a consistent and hassle-free development environment for every team member, regardless of their local machine setup.

### Key Features & Benefits

*   **Zero-Dependency Setup:** The script handles its own Node.js installation, so you can get started with just a single command.
*   **Consistent Environment:** It wraps Docker Compose commands, ensuring that all developers run the project with the same configuration.
*   **Simplified Workflow:** Complex tasks like setting up local SSL certificates, managing hosts files, and assigning unique IP addresses are reduced to a single command (`bin/env install`).
*   **Cross-Platform Compatibility:** It works seamlessly on Linux, macOS, and Windows Subsystem for Linux (WSL), automatically handling OS-specific logic.
*   **Extensibility:** The program is designed to be extended with custom commands and functionality specific to your project's needs.

## Getting Started

Using the program is straightforward. All commands are run from the project's root directory:

```bash
# General command structure
bin/env <command> [options]

# To see a full list of commands
bin/env --help
```

The first time you run `bin/env`, it may take a moment to set itself up. It will:
1.  Check for a specific version of Node.js in a local cache (`~/.bin-env/node`).
2.  If not found, it will download and cache it for you.
3.  Install its own npm dependencies (located in `bin/_env/node_modules`) if they are missing or if `bin/_env/package.json` has changed.

This entire process is automatic and ensures the tool always runs in a predictable environment without polluting your global system paths.

## Project Installation with `bin/env install`

To get the most out of the `hawki-client` development environment, you can run the `install` command.

```bash
bin/env install
```

**Note:** This command is completely **optional**. You can still use `bin/env` to manage the Docker environment (`up`, `down`, etc.) without running it. The `install` command simply automates the creation of a more advanced, "production-like" local setup.

When executed, the `install` command performs a one-time setup on your machine:
*   **Checks Dependencies:** It verifies that required tools like `mkcert` (for SSL) and others are installed. If they are missing, it will attempt to install them using your system's package manager (e.g., Homebrew on macOS, APT/YUM on Linux, Scoop on Windows/WSL).
*   **Assigns a Unique IP Address:** It allocates a new loopback IP address (e.g., `127.0.1.1`) for the project to avoid port conflicts with other local services.
*   **Configures a Local Domain:** It generates a local domain name (e.g., `hawki-client.dev.local`) and maps it to the new IP address in your system's `hosts` file.
*   **Generates SSL Certificates:** It uses `mkcert` to create a locally trusted SSL certificate, allowing you to access your project via `https://` in the browser without security warnings. The certificates are stored in `docker/certs/`.
*   **Updates `.env` File:** It saves the new IP address and domain to your project's `.env` file, automatically configuring the Docker environment.

During this process, you will likely be prompted for your `sudo` (administrator) password, as the script needs elevated permissions to modify the `hosts` file and install SSL root certificates.

## Common Commands and Use Cases

Here are some of the most frequently used commands.

| Command                            | Description                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `bin/env install`                  | (Optional) Performs the one-time setup for a local HTTPS environment.       |
| `bin/env up`                       | Starts the Docker containers in detached mode.                              |
| `bin/env up -f` or `bin/env up --attach` | Starts the containers and follows the log output.                         |
| `bin/env stop`                     | Stops the running Docker containers.                                        |
| `bin/env down`                     | Stops and removes the containers, but preserves volumes.                    |
| `bin/env restart`                  | Restarts all services.                                                      |
| `bin/env logs`                     | Shows the logs for the main application service.                            |
| `bin/env logs -f --all`            | Follows the logs for all services.                                          |
| `bin/env ssh`                      | Opens a `bash` or `sh` shell inside the primary `node` service container.   |
| `bin/env npm <command>`            | Runs an `npm` command (e.g., `install`, `ci`) inside the `node` container.   |
| `bin/env build`                    | Executes the project's build script inside the `node` container.            |
| `bin/env open`                     | Opens the project's URL in your default browser.                            |
| `bin/env clean`                    | Stops and removes all containers, networks, volumes, and images associated with the project. **Use with caution!** |
| `bin/env env:reset`                | Resets your `.env` file to the default state defined in the project.        |

### Example Workflow

1.  **First-time setup (recommended):**
    ```bash
    # Run the interactive installer
    bin/env install

    # The installer will automatically start the project.
    # You can now visit the URL provided at the end of the installation.
    ```

2.  **Daily development:**
    ```bash
    # Start the services
    bin/env up

    # Check the running containers
    bin/env ps

    # Open the project in your browser
    bin/env open

    # Get a shell inside the container to run commands
    bin/env ssh

    # When you're done for the day
    bin/env down
    ```

## Extending `bin/env`

The `bin/env` program is designed to be extensible through an addon system. You can add new commands or hook into existing functionality without modifying the core files.

### Adding New Commands

To add a new command, create a new TypeScript file ending with `.addon.ts` in either `bin/_env/` or `bin/_env/addons/`. The program will automatically discover and load it.

The addon file must export a function named `addon` that returns a configuration object. To add commands, provide a `commands` property.

**Example: `bin/_env/addons/hello.addon.ts`**

```typescript
import type { AddonEntrypoint } from '@/loadAddons.ts';

// This is the entry point for your addon
export const addon: AddonEntrypoint = async (context) => ({
  // The 'commands' property is a function that receives the commander program instance
  commands: async (program) => {
    program
      .command('hello')
      .description('Prints a friendly greeting')
      .argument('[name]', 'The name to greet', 'World')
      .action((name) => {
        // You can access the context to use its helpers
        console.log(`Hello, ${name}! Project name is: ${context.docker.projectName}`);
      });
  },
});
```

After creating this file, the new command will be available immediately:
```bash
$ bin/env hello
Hello, World! Project name is: hawki-client

$ bin/env hello Developer
Hello, Developer! Project name is: hawki-client
```

### Managing Dependencies

If your new command requires additional Node.js packages, you can add them to `bin/_env/package.json`. To simplify this, `bin/env` provides a wrapper for `npm` that operates within the tool's own environment.

Use `bin/env --npm` to run any `npm` command. For example, to add the `cowsay` package:

```bash
# This modifies bin/_env/package.json and installs the package
bin/env --npm install cowsay
```

You can now `import` and use this package in your addon file. The `bin/env` script will automatically run `npm install` on the next execution to ensure the dependency is available.

### The Events System

Addons can communicate and hook into core functionality using an event-driven system. The `EventBus` allows you to listen for events triggered by other parts of the application.

For example, the `docker` addon triggers a `docker:up:before` event just before it runs `docker compose up`. Another addon could listen for this to perform a preliminary action.

**Example: Hooking into `docker:up`**
```typescript
import type { AddonEntrypoint } from '@/loadAddons.ts';

export const addon: AddonEntrypoint = async (context) => ({
  // The 'events' property is an async function that receives the event bus
  events: async (events) => {
    // Listen for the 'docker:up:before' event
    events.on('docker:up:before', async (payload) => {
      console.log('About to start Docker containers...');
      // 'payload.args' is a Set of arguments that will be passed to 'docker compose up'
      // You could modify it here, for example:
      // payload.args.add('--build');
    });
  },
});
```
This powerful mechanism allows for deep customization and integration between different parts of the developer tool. You can discover available events by looking at the type definitions in `bin/_env/core/EventBus.ts` and `bin/_env/addons/docker/global.d.ts`.

## Embracing HawkiClient: The Heart of Library Integration

With a firm grasp of the `bin/env` development helper and its event-driven addons for orchestrating local environments, we're now poised to shift gears and delve into the core of interacting with the HAWKI library itself. The `HawkiClient` serves as the pivotal interface, enabling seamless connections whether you're building within the HAWKI frontend or integrating externally with third-party apps. Setting up the client involves crafting a configuration that handles authentication, data flows, and security—essential for robust, scalable applications. Let's explore how to create and configure this powerful client in the next chapter.

For a deep dive into initializing `HawkiClient`, including the async `createHawkiClient` function and the nuances of `'internal'` versus `'external'` setups, head over to [HawkiClient: Creation and Configuration](hawkiclient-creation-and-configuration-382472665.md).

