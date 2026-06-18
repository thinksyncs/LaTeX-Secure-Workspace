# Overview

## Release Flows

The release automation uses one public registry channel and one preview artifact flow.

- `stable-release.yml`: builds from a published GitHub release tag, publishes the package to the VS Code Marketplace, uploads the VSIX to GitHub Releases, and fails closed in the canonical repository if the Marketplace credential is missing.
- `auto-stable-release.yml`: watches the required push CI workflows on `master`, creates the matching stable GitHub release when they have all passed for the current `package.json` version, and dispatches `stable-release.yml` for that tag.
- `daily-release.yml`: builds, tests, packages a daily preview VSIX, refreshes the rolling GitHub `daily` prerelease, and attaches summaries of open pull requests, CodeQL alerts, and Dependabot alerts. It does not publish to extension registries.

The canonical repository expects:

- `VSCE_PAT` for VS Code Marketplace publishing.

Open VSX publishing remains available in the shared publish action for a future explicit opt-in, but stable releases keep it disabled.
Forks skip registry publication when the Marketplace secret is absent, but the canonical repository fails the stable release workflow instead so shipping gaps are visible immediately.
The release jobs run VS Code integration tests on Linux under `xvfb-run` so Electron can start in a headless GitHub Actions environment.
All workflows that run VS Code integration tests set `LATEXWORKSHOP_ALLOW_VSCODE_TEST_DOWNLOAD=1` and `LATEXWORKSHOP_VSCODE_TEST_VERSION` explicitly. Local test runs should instead prefer `LATEXWORKSHOP_VSCODE_TEST_PATH` when a preinstalled VS Code build is being audited.
Stable Marketplace publication is therefore automatic only after the required push CI is green on the current `master` commit and no GitHub release already exists for the `package.json` version.

## Dependency Audit

The `npm-audit.yml` workflow intentionally runs both `npm run audit:prod` and `npm run audit:full` on pushes and pull requests. The production gate keeps shipped dependencies clean, while the full gate mirrors Dependabot's dynamic npm audit behavior so dev-only advisories fail fast before they reappear as separate Dependabot update failures.

The security guardrails also run `npm run audit:native`, which scans `package-lock.json` for native addon and prebuild indicators. Dev-only packaging dependencies may be reported for review, but runtime native addon indicators fail the guardrail unless explicitly reviewed.

We run tests on GitHub Actions on Windows, macOS, and Linux with the minimal installations of TeX Live.

We can see [preinstalled software](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners#preinstalled-software) on each platform. Perl 5 is installed even on Windows. So, all we have to do is just installing TeX Live.

## Installing TeX Live

For the installer of TeX Live, `install-tl`, see the [official manual](https://tug.org/texlive/doc/install-tl.html). Giving a profile fie to the option, `-profile`, we can install TeX Live in batch mode with no user interaction.

The CI workflows download TeX Live installers from CTAN over HTTPS only, pin the archive and checksum downloads to the same resolved mirror, retry when mirror synchronization briefly returns mismatched checksums, carry that resolved repository through `install-tl` and `tlmgr`, and verify the archive with the published `.sha512` checksum and `.sha512.asc` signature before extraction or execution. The `tlmgr` package operations import the pinned TeX Live signing key into a dedicated `TL_GNUPGHOME`, run with `--verify-repo=all`, and assert that repository metadata was reported as `(verified)`. Windows uses a relative `TL_GNUPGHOME` so `tlmgr` does not hand a drive-letter path to Git for Windows' MSYS `gpg`. When changing these workflows, avoid plaintext HTTP downloads and prefer strict `curl` options that fail closed on transfer or TLS errors.

We no longer download standalone `latexindent` binaries in CI. Instead, the shared Linux TeX Live setup action installs `latexindent` from TeX Live, prefers the packaged executable when it is present, and only falls back to a small wrapper around `latexindent.pl` if the executable is unavailable. This avoids executing an extra unsigned binary fetched from a mirror.

The same shared TeX Live setup is used by the Linux validation workflow and both release workflows, so release packaging runs against the same LaTeX toolchain that the test suite expects.

We can see available installation schemes, `scheme-infraonly`, `scheme-small`, and so on in
```
/usr/local/texlive/2019/tlpkg/texlive.tlpdb
```

For the management command of TeX Live, `tlmgr`, see the [official document](https://www.tug.org/texlive/doc/tlmgr.html).

## Cache

To avoid install TeX Live each time, we use a caching feature, [actions/cache](https://github.com/actions/cache). The caches for the `master` branch are also used for feature branches.

Because these caches contain executable toolchains, any cache-key changes should be treated as a trust-boundary change and reviewed carefully.

The TeX Live workflows now encode the TeX Live year in both the workflow name and the cache key. For example:

```yaml
name: TeX Live 2026 on Linux
env:
  TEXLIVE_YEAR: '2026'
  cache-version: tl-2026-v1
```

When moving to a new TeX Live year, update both values together. That forces an annual cache refresh and makes the intended toolchain year visible in workflow runs.

The caches are removed if they have not been accessed in over 7 days.
When we want to remove the caches manually within the same TeX Live year, increase the trailing revision in `cache-version`.

```yaml
env:
  TEXLIVE_YEAR: '2026'
  cache-version: tl-2026-v2
```

## References

For the details of GitHub Actions, read the following documents.

- https://docs.github.com/en/actions
- https://docs.github.com/en/actions/configuring-and-managing-workflows/caching-dependencies-to-speed-up-workflows
- https://github.com/actions/checkout
- https://github.com/actions/cache
- https://github.com/actions/setup-node
