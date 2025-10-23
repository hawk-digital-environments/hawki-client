# Infrastructure

Building on [The Event Bus: The Client's Nervous System](the-event-bus-the-client-s-nervous-system-8645510.md), where we explored the central communication layer decoupling the library's features, this chapter addresses the project infrastructure supporting such dynamic interactions. This chapter provides an overview of the project's development environment, which is managed using Docker and Docker Compose. Our goal is to provide a consistent, isolated, and easy-to-use setup for all developers.

## Overview

The `hawki-client` project uses Docker to containerize its development environment. This approach solves the classic "it works on my machine" problem by ensuring that every developer runs the application in the exact same environment.

The core of our infrastructure is a single Docker container defined in `docker-compose.yml`. This container provides:

*   **A Node.js Environment**: Based on the official `node:23-bookworm` image, giving us a modern and stable JavaScript runtime.
*   **Code Synchronization**: Your local project files are directly mounted into the container. This means any changes you make on your host machine are instantly reflected inside the container, without needing to rebuild the image.
*   **Security**: The container runs processes as a non-root user. This user's ID is synchronized with your local user ID to prevent file permission issues, which is a common headache when using Docker for development.
*   **An Interactive Shell**: The container is configured to give you a `bash` shell, allowing you to run project-specific commands like `npm install`, `npm start`, etc., from within the container's isolated environment.

## Getting Started

Follow these steps to build and run the development infrastructure.

### Prerequisites

*   [Docker](https://docs.docker.com/get-docker/)
*   [Docker Compose](https://docs.docker.com/compose/install/)

### 1. Configuration

The infrastructure uses a `.env` file in the project root to configure essential variables. This file is ignored by Git, so you'll need to create it yourself.

1.  Create a file named `.env` in the root of the project.
2.  Add the following content:

    ```bash
    # The name for your project, used for naming containers and images.
    PROJECT_NAME=hawki-client

    # Your local user and group ID.
    DOCKER_UID=1000
    DOCKER_GID=1000
    ```

3.  **Crucially**, you must update `DOCKER_UID` and `DOCKER_GID` to match your local user's IDs. This ensures that files created inside the container have the correct ownership on your host machine.

    *   On **Linux** or **macOS**, you can find your user and group ID by running:
        ```sh
        echo "DOCKER_UID=$(id -u)"
        echo "DOCKER_GID=$(id -g)"
        ```
    *   Update your `.env` file with the output from these commands.

### 2. Build and Run the Container

With your `.env` file configured, you can now build the image and start the container.

1.  **Build the Image**: Open your terminal in the project root and run:

    ```sh
    docker compose build
    ```

    This command reads the `Dockerfile` and `docker-compose.yml` to build a custom Docker image named `hawki-client-node:dev`.

2.  **Start the Service**: To start the container in the background, run:

    ```sh
    docker compose up -d
    ```

3.  **Access the Container**: The container is now running. To get an interactive shell inside it, run:

    ```sh
    docker compose exec node bash
    ```

You are now inside the container's `bash` shell, at the `/build` directory, which is a mirror of your project's root folder. From here, you can run all project-related commands (e.g., `npm install`).

To stop the container, run `docker compose down`.

## Component Breakdown

*   **`Dockerfile`**: This file is the blueprint for our development image. It starts with a base Node.js image (`node:23-bookworm`), and its primary job is to create a non-root user (`builder`) with the user/group ID you provided in the `.env` file. This is a security best practice and helps with file permissions.

*   **`docker-compose.yml`**: This file defines and configures our `node` service. Here are the key directives:
    *   `build`: Tells Docker Compose to build an image from the current directory (`.`) using the `Dockerfile`.
    *   `volumes`: This is where the magic happens for live development. It mounts your local project directory (`./`) to two locations inside the container:
        *   `/build`: The primary working directory.
        *   `/var/www/html`: A secondary mount point, potentially for a web server if one is added later.
    *   `entrypoint: bash` & `tty: true`: These directives override the default command of the Node.js image. Instead of starting a Node.js process, the container starts and waits with an active `bash` terminal, ready for you to connect.
    *   `extra_hosts`: Adds an entry for `host.docker.internal`, which allows the container to communicate with any services running directly on your host machine (e.g., a local database server).

*   **`.dockerignore`**: This file lists files and directories that should be excluded from the Docker build context. This keeps the image lightweight and avoids potentially leaking sensitive information (like the `.env` file) into the image layers.

## Best Practices

*   **Rebuild When Necessary**: If you make changes to the `Dockerfile`, you must rebuild the image for those changes to take effect. You can force a rebuild with `docker compose up --build`.
*   **Clean Up**: Docker can accumulate many unused images, containers, and volumes over time. Periodically run `docker system prune` to reclaim disk space.
*   **Development Only**: This setup is optimized for development. For a production deployment, you would typically use a multi-stage `Dockerfile` to create a smaller, more secure image without a shell or development dependencies.
*   **Keep Secrets Out of a git repo**: The `.env` file is in `.dockerignore` for a reason. Any secrets or environment-specific variables should be kept there and not committed to version control.

## Troubleshooting

*   **"Permission denied" errors when creating files:**
    This is the most common issue and is almost always caused by an incorrect `DOCKER_UID` or `DOCKER_GID` in your `.env` file.
    1.  Stop the container: `docker compose down`.
    2.  Verify your IDs using `id -u` and `id -g`.
    3.  Correct the values in your `.env` file.
    4.  Rebuild and restart: `docker compose up -d --build`.

*   **Changes to my code aren't showing up in the container:**
    Ensure your container is running and that the volume mounts in `docker-compose.yml` are correctly pointing your project directory (`./`) to the container's working directory (`/build`).

*   **Container won't start:**
    Check the container logs for errors:
    ```sh
    docker compose logs node
    ```
    The logs often provide clear clues about what went wrong.

*   **Connecting to services on the host machine:**
    If you need the container to access a service running on your local machine (e.g., a database on `localhost:5432`), use `host.docker.internal` instead of `localhost` as the hostname. For example, the connection string inside the container would be `postgres://user:pass@host.docker.internal:5432/db`.

## Automating Deployment with CI/CD Pipelines

Having established a robust infrastructure setup using Docker, Compose, and environment management, you're now ready to streamline your development workflow further. With infrastructure in place, the next step is integrating continuous integration and continuous deployment to automate building, testing, and releasing your application. In the following chapter on [CI/CD Pipeline](ci-cd-pipeline-610418824.md), we'll explore how GitHub Actions powers the `hawki-client` project's release process, from commit analysis and versioning to seamless package publishing on NPM, ensuring your updates are deployed quickly and reliably.

