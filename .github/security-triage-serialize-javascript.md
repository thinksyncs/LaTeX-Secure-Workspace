# Security Triage: serialize-javascript (development dependency)

## Summary

- Advisories: GHSA-5c6j-r48x-rmvq and GHSA-m5mm-p8h7-m29v
- Affected package: `serialize-javascript`
- Current path: `mocha -> serialize-javascript`
- Scope: `devDependencies` only

## Impact assessment

- Mocha uses this package to serialize parallel-worker options. The repository's VS Code test runners use serial mode.
- The extension bundler does not import Mocha, and packaging excludes tests and `node_modules`. Verify the final VSIX when releasing; dependency scope alone is not artifact evidence.
- The reported HTML-embedding path has not been demonstrated in this repository. The dependency still needs to pass the full audit.

## Update decision (2026-10-29)

- Keep Mocha 11 and raise its existing `serialize-javascript` override to `^7.1.3`, the patched range for the closing-script suffix issue.
- Remove the obsolete Dependabot ignore rule. The earlier managed-risk acceptance no longer applies.
- Exercise closing-script suffixes and ordinary serialized values in `test/node/dependency-security.test.js`. Run Node and VS Code integration tests, full and production audits, and VSIX packaging before release.

Re-evaluate the override when Mocha's dependency range changes. Do not suppress new audit findings based on development-only scope.
