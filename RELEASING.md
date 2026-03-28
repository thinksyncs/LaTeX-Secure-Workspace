# Releasing

This repository has two release tracks: `stable` and `daily`.

## Prerequisites

- GitHub Actions must have a `VSCE_PAT` secret that can publish to the `ToppyMicroServices` Marketplace publisher.
- Stable releases are published from GitHub release tags.
- Daily releases are published by the scheduled GitHub Actions workflow.

## Stable Release

1. Commit the release changes on `master`.
2. Push `master` to GitHub.
3. Update `package.json` to the intended stable version if needed.
4. Create and push a Git tag such as `v1.2.4`.
5. Publish a GitHub Release for that tag.
6. `stable-release.yml` builds, tests, packages the VSIX, publishes to the Marketplace stable channel, and uploads the VSIX to the GitHub Release.

## Daily Release

- `daily-release.yml` runs every day or on manual dispatch.
- The workflow builds, tests, and packages a VSIX.
- The workflow refreshes the rolling GitHub `daily` prerelease.
- The workflow publishes to the Marketplace pre-release channel.
- The workflow attaches a summary of open pull requests, CodeQL alerts, and Dependabot alerts to the daily prerelease notes.

## Versioning

- Stable versioning:
  - `1.2.3 -> 1.2.4`
  - `1.2 -> 1.3.0`
- Daily versioning:
  - `1.2.3 -> 1.3.<run_number>`
  - `1.2 -> 1.3.<run_number>`

The daily prerelease line intentionally stays ahead of the last stable minor version.
