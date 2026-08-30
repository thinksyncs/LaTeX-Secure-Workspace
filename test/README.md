# Overview

## Executing tests

`npm test` runs the Node-based checks in `test/node/` and `test/fuzz/`. It does not start VS Code or change the active window.

`npm run test:integration` runs the extension integration tests. These tests load `src/main`, call VS Code APIs, and exercise commands, editors, webviews, workspace trust, and multi-root behavior. They therefore require an isolated Extension Development Host instead of the VS Code window used for development.

The integration runner starts a new VS Code instance for the `unittest`, `testground`, and `multiroot` fixtures. The `testground` and `multiroot` directories in `test/fixtures/` include TeX-related files used by tests in `suites/*.test.ts`.
For tests of building a LaTeX file, we try to build a LaTeX file in the directory.
If a PDF file is not generated, the test fails.
The TeX files related are automatically created before the test and removed after.

Property-based fuzz coverage for parser-facing code lives in `test/fuzz/` and can also be executed directly with `npm run test:fuzz`.

CI runs both groups through `npm run test:ci`. Coverage and release verification also invoke the integration tests explicitly, so changing the local default does not reduce those checks.

The `Docker secure builds on Linux` workflow separately runs `npm run test:docker` against an immutable TeX Live image. It invokes the production `scripts/latexmk` wrapper for both fixed profiles and verifies that each profile produces a PDF in the isolated output directory. It also checks that shell escape remains disabled, LuaLaTeX cannot load the socket library, the source mount rejects writes, and LuaLaTeX populates its cache inside the isolated output directory.

The Docker test does not pull an implicit image. For a local run, first pull a digest-pinned TeX Live image and set `LATEXWORKSHOP_DOCKER_TEST_IMAGE` to the same `repository@sha256:...` value. This keeps the test input explicit and reproducible.

### How tests are executed via CLI

1. `runTest.ts` starts an isolated VS Code instance for each required fixture and executes `units/index.ts` or `suites/index.ts`.
2. Tests in `*.test.ts` are executed through test `runTest()` function defined in `suites/utils.ts`, which skip tests in `*.test.ts` if they are not related to the current `fixture` directory.

To run one unit group without opening the other fixture hosts:

```sh
LATEXWORKSHOP_UNIT=08_compile_build npm run test:integration
```

To run one integration suite:

```sh
LATEXWORKSHOP_SUITE=05_viewer npm run test:integration
```

On macOS local runs, `runTest.ts` starts the integration test host in the background by default to reduce focus changes.
Set `LATEXWORKSHOP_FOREGROUND_TESTS=1` if you explicitly want the foreground window back for debugging.

The CLI test runner does not download VS Code unless that is explicitly requested. Set `LATEXWORKSHOP_VSCODE_TEST_PATH` to an existing VS Code executable, or set `LATEXWORKSHOP_ALLOW_VSCODE_TEST_DOWNLOAD=1` to let `@vscode/test-electron` download the pinned test host. `LATEXWORKSHOP_VSCODE_TEST_VERSION` overrides the default pinned version.

To capture evidence for a PDF tab viewer renderer exit, run `npm run diagnose:pdf-viewer -- --pdf path/to/repro.pdf` soon after the crash. The bundle is written under `artifacts/pdf-viewer-crash/`.

### How tests are executed via VS Code launch

We have a `Run Tests` launch configuration in `.vscode/launch.json`.
In the config item, the first `args` passed to `code` defines the workspace to open: `testground` typically, and `multiroot/resource.code-workspace` for the multi-root workspace tests.
Additionally, the `LATEXWORKSHOP_SUITE` envvar defines the suites to be executed, separated by commas and all if left empty.

If you do not need breakpoints, prefer `Run > Start Without Debugging` when using these launch configurations.
This reduces debugger-driven focus changes, though macOS may still briefly foreground the `Extension Development Host` window when VS Code starts the test instance.


## Executing Tests on GitHub Actions

Read [.github/workflows](https://github.com/thinksyncs/LaTeX-Secure-Workspace/tree/master/.github/workflows) to see how tests are executed on GitHub Actions.
