# Releasing

This repository has two release tracks: `stable` and `daily`.

## Prerequisites

- GitHub Actions must have a `VSCE_PAT` secret that can publish to the `ToppyMicroServices` Marketplace publisher.
- The `marketplace` GitHub environment must require an authorized reviewer.
- Stable releases are published from GitHub release tags.
- Daily releases are published by the scheduled GitHub Actions workflow.

## Stable Release

1. Update `package.json` to the intended stable version if needed.
   Keep the existing major version line and update the minor or patch version instead of bumping the major version.
2. Commit and push the release changes on `master`.
3. Wait for all required push CI workflows to pass. `auto-stable-release.yml` creates the matching tag and GitHub Release, then dispatches `stable-release.yml`.
4. Approve the waiting `marketplace` environment deployment after checking the tag, version, and commit.
5. `stable-release.yml` builds, tests, audits, and packages the VSIX; generates an SPDX SBOM; publishes build-provenance and SBOM attestations; publishes to the Marketplace stable channel; and uploads the VSIX and SBOM to the GitHub Release.

For a manual recovery release, create and publish the matching GitHub Release and dispatch `stable-release.yml` with that tag. The same environment approval and validation steps still apply.

## Daily Release

- `daily-release.yml` runs every day or on manual dispatch.
- The workflow builds, tests, and packages a VSIX.
- The workflow refreshes the rolling GitHub `daily` prerelease.
- The workflow attaches a summary of open pull requests, CodeQL alerts, and Dependabot alerts to the daily prerelease notes.

## Versioning

- Stable versioning:
  - `1.2.3 -> 1.2.4`
  - `1.2 -> 1.3.0`
- Stable releases must not bump the major version. Stay on the current major line and update only the minor or patch version.
- Daily versioning:
  - `1.2.3 -> 1.3.<run_number>`
  - `1.2 -> 1.3.<run_number>`

The daily prerelease line intentionally stays ahead of the last stable minor version for GitHub preview artifacts only. Marketplace publication uses stable releases.
