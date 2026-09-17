# Releasing

This repository has two release tracks: `stable` and `daily`.

## Prerequisites

- GitHub Actions must have a `VSCE_PAT` secret that can publish to the `ToppyMicroServices` Marketplace publisher.
- The `marketplace` GitHub environment must require an authorized reviewer.
- Stable releases are published from GitHub release tags.
- Daily releases are published by the scheduled GitHub Actions workflow.

## Stable Release

1. Update `package.json` and `package-lock.json` to the intended stable version, and add the release notes to `CHANGELOG.md`.
   Keep the existing major version line and update the minor or patch version instead of bumping the major version.
2. Push the release changes on a branch, open a pull request, and merge it into protected `master` after the required checks pass.
3. Wait for all required push CI workflows to pass. `auto-stable-release.yml` creates the matching tag and GitHub Release, then dispatches `stable-release.yml`.
4. Approve the waiting `marketplace` environment deployment after checking the tag, version, and commit.
5. `stable-release.yml` builds, tests, audits, and packages the VSIX; generates an SPDX SBOM; publishes build-provenance and SBOM attestations; publishes to the Marketplace stable channel; and uploads the VSIX and SBOM to the GitHub Release.

For a manual recovery release, create and publish the matching GitHub Release and dispatch `stable-release.yml` with that tag. The same environment approval and validation steps still apply.

## Release notes for users

Add an entry to `CHANGELOG.md` only when preparing an authorized release. Describe the shipped change, not the implementation plan. Use this template, omitting empty sections:

```markdown
## [VERSION] - YYYY-MM-DD

### User impact
- What changes in the user's workflow, and who benefits or is affected.

### Required action
- State any migration or setting change. Write "None" when no action is needed.

### Known limitations
- State relevant limits and environments that have not been verified.
```

For example, a settings-display change can say: "Settings for disabled workflows are marked deprecated. Existing setting keys and values remain accepted; build behavior is unchanged. No action is required."

For a rebuild-only release, state the actual reason for rebuilding, whether runtime code or dependencies changed, and whether users need to update. Do not imply a feature or security fix when none shipped. For example: "Repackage the same implementation to correct the Marketplace documentation. Runtime code and dependency versions are unchanged. No settings migration is required." Use that explanation only if it matches the release.

Do not rewrite historical entries, bump a version, or dispatch publication as part of documentation-only maintenance.

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
