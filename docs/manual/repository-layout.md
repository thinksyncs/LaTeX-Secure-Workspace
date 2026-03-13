# Repository Layout

This repository is easier to maintain when each top-level folder has a clear
role.

## Top-Level Structure

- `src/`: extension host TypeScript source
- `viewer/`: vendored secure PDF viewer runtime assets
- `vendor/pdfviewer-secure/`: upstream snapshot metadata and webview source used to rebuild the bundled runtime
- `resources/`: webview assets used by the extension
- `syntax/`: TextMate grammars and language-configuration files
- `data/`: completion, package, snippet, and metadata sources
- `test/`: unit, integration, fixture, and CI test assets
- `docs/`: secure-fork documentation and manuals
- `dev/`: maintainer scripts and data-generation helpers
- `samples/`: small sample workspaces for local verification

## Local-Only Generated Areas

These areas are intentionally treated as disposable local output:

- `artifacts/`: local VSIX packaging output and release staging
- `out/`: compiled JavaScript
- `node_modules/`: installed dependencies
- `samples/sample/*.aux`, `*.fdb_latexmk`, `*.fls`, `*.log`, `*.pdf`: generated
  sample build outputs

## Cleanup Guidelines

- Prefer deleting generated files instead of committing them.
- Keep secure-fork documentation under `docs/` instead of adding new root-level
  markdown files unless the file is a standard repository entry point.
- Remove dead feature files only after verifying that they are no longer
  imported from `src/`, vendored viewer assets, tests, or packaging configuration.
