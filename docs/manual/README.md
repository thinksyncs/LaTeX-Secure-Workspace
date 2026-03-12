# Secure Build Manual

This manual collects the local documentation that best matches the current
LaTeX-Secure-Workspace fork.

## What This Build Supports

LaTeX-Secure-Workspace keeps a deliberately small workflow surface:

- Manual LaTeX build with the fixed internal recipe
- Root-file detection with the secure root-resolution policy
- Local tab-based PDF viewing with one-way refresh
- IntelliSense, snippets, hover help, outline, and diagnostics

The fork intentionally does not expose Live Share integration, browser viewer
flows, internal preview-server workflows, texdoc, TeX word count, or the math
preview panel.

## Reading Order

Start here when you need the current secure-fork behavior:

1. [Repository layout](./repository-layout.md)
2. [Security hardening summary](../security-hardening.md)
3. [Security hardening summary (Japanese)](../security-hardening.ja.md)

Upstream pages are still useful for shared editing concepts, but treat any page
that mentions SyncTeX, browser preview, custom tools, custom recipes, Live
Share, or preview-server behavior as upstream-only reference material.

## Quick Start

1. Install dependencies with `npm ci`.
2. Compile the extension with `npm run compile`.
3. Run lint checks with `npm run lint`.
4. Launch the extension from VS Code with the `Run Extension` debug profile.

## Secure-Fork Notes

- Build, clean, kill, and reveal-output operations require a trusted workspace.
- Secure build and viewer flows ignore `%!TEX root` and related build-control
  magic comments.
- Generated local packaging artifacts should live under `artifacts/`.
- Generated sample outputs under `samples/sample/` are ignored and should not be
  committed.
