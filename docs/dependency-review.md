# glob maintenance review

Reviewed on 2026-09-22 for Beads `LaTeX-Secure-Workspace-o5d`.

The extension uses `glob.sync` in `src/utils/utils.ts`; the test runners
also use its library API. No repository command invokes the glob CLI.
The direct dependency is updated from 11.1.0 to 13.0.6. Its published
Node range (`18 || 20 || >=22`) retains our Node 20 baseline. Version 13
moves the CLI to a separate package; these library call sites do not use it.
See the [upstream changelog](https://github.com/isaacs/node-glob/blob/main/changelog.md).

The reviewed lock also contains development-only glob copies through
`@vscode/vsce` (11.1.0), `mocha` (10.5.0), and `c8` → `test-exclude`
(10.5.0). Those consumers retain their declared version ranges. We do not
force a new major version through an override just to remove warnings.
Update those copies when their consumers support the new major version,
or when a relevant advisory requires a targeted fix.

The registry marks 10.5.0 and 11.1.0 deprecated. The published
[CLI advisory](https://github.com/isaacs/node-glob/security/advisories/GHSA-5j98-mcp5-4vw2)
lists those versions as patched and excludes the library API from that
specific flaw. Full and production npm audits reported zero known
vulnerabilities at review time. This is not proof that all dependencies
are safe, nor a reason to suppress future advisories.
