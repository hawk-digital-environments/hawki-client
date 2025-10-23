# CI/CD Pipeline

Building on the foundational infrastructure setup and management discussed in [Infrastructure](infrastructure-610545213.md), this chapter outlines the CI/CD (Continuous Integration/Continuous Deployment) pipelines for the `hawki-client` project. We use GitHub Actions to automate our release and deployment processes, ensuring consistency and reliability.

## Release Workflow (`release.yml`)

This workflow automates the process of creating and publishing a new release of the `hawki-client` package to the NPM registry.

### Overview

The "Create new Release (Frontend)" pipeline is responsible for the entire release lifecycle of the package. It streamlines the process by automatically handling versioning based on conventional commit messages, generating a changelog, creating a corresponding release on GitHub, and finally, publishing the newly versioned package to NPM for public use.

### Triggers

This workflow runs automatically under the following conditions:

*   **Manual Trigger**: It can be run on-demand from the GitHub Actions tab (`workflow_dispatch`).
*   **Push to `main`**: It is triggered on every push to the `main` branch, but only if changes are detected within the `examples/` directory or the workflow file itself (`.github/workflows/release.yml`).

### Jobs

The pipeline consists of a single job named `release`:

*   **`release`**: This job runs on an `ubuntu-latest` runner and performs all the necessary steps for a release.
    1.  **Changelog & Versioning**: It analyzes the commit history since the last release to automatically determine the next version number (patch, minor, or major) and generate release notes. It updates the `package.json` file with the new version.
    2.  **Source Code Update**: It injects the new version number into the `src/version.ts` file to keep the source code in sync.
    3.  **Build**: It installs all project dependencies and runs the build script (`npm run build`) to create the distributable package files.
    4.  **Publish**: It publishes the built package to the NPM registry.

### Deployment

This workflow includes a deployment step that makes the package available to the public.

*   **What is deployed?**: The final, compiled JavaScript package ready for consumption in other projects.
*   **Where is it deployed?**: The package is published to the public [NPM registry](https://registry.npmjs.org/).
*   **How is it deployed?**: The job uses the `npm publish` command to upload the package. This step requires an authentication token to gain publishing rights to the package on NPM.

### Required Secrets

To function correctly, this workflow requires the following secret to be configured in the GitHub repository's settings (`Settings > Secrets and variables > Actions`):

*   **`NPM_TOKEN`**: A valid authentication token from NPM with permissions to publish the package. This is used to authenticate with the NPM registry during the `npm publish` step.

