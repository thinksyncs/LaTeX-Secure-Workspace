# Overview

## Release Channels

The release automation is split into two channels.

- `stable-release.yml`: builds from a published GitHub release tag and publishes to the Marketplace stable channel.
- `daily-release.yml`: builds, tests, and packages a daily prerelease, refreshes the rolling GitHub `daily` prerelease, publishes to the Marketplace pre-release channel, and attaches summaries of open pull requests, CodeQL alerts, and Dependabot alerts.

Both release workflows expect a `VSCE_PAT` secret with permission to publish to the `ToppyMicroServices` Marketplace publisher.
The release jobs run VS Code integration tests on Linux under `xvfb-run` so Electron can start in a headless GitHub Actions environment.

We run tests on GitHub Actions on Windows, macOS, and Linux with the minimal installations of TeX Live.

We can see [preinstalled software](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners#preinstalled-software) on each platform. Perl 5 is installed even on Windows. So, all we have to do is just installing TeX Live.

## Installing TeX Live

For the installer of TeX Live, `install-tl`, see the [official manual](https://tug.org/texlive/doc/install-tl.html). Giving a profile fie to the option, `-profile`, we can install TeX Live in batch mode with no user interaction.

The CI workflows download TeX Live installers from CTAN over HTTPS only, pin the archive and checksum downloads to the same resolved mirror, and verify them with the published `.sha512` checksum and `.sha512.asc` signature before extraction or execution. When changing these workflows, avoid plaintext HTTP downloads and prefer strict `curl` options that fail closed on transfer or TLS errors.

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

The TeX Live workflows intentionally track the current TeX Live network repository at `mirror.ctan.org`. Because that source rolls forward over time, the workflow name and cache key avoid baking in a year. For example:

```yaml
name: TeX Live (current) on Linux
env:
  cache-version: tl-current-v1
```

When we want to refresh the cached toolchain, bump the trailing revision in `cache-version`. If we later switch these workflows to a year-pinned historic TeX Live repository, update the workflow names and this documentation at the same time.

The caches are removed if they have not been accessed in over 7 days.
When we want to remove the caches manually, increase the trailing revision in `cache-version`.

```yaml
env:
  cache-version: tl-current-v2
```

## References

For the details of GitHub Actions, read the following documents.

- https://docs.github.com/en/actions
- https://docs.github.com/en/actions/configuring-and-managing-workflows/caching-dependencies-to-speed-up-workflows
- https://github.com/actions/checkout
- https://github.com/actions/cache
- https://github.com/actions/setup-node
