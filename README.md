# LaTeX Workspace Security

Secure LaTeX tools for [Visual Studio Code](https://code.visualstudio.com/) with project-local completions, manual build, diagnostics, and a local PDF tab viewer with SyncTeX.

## TL;DR

- Project-local completions for citations, labels, commands, packages, and input paths
- Manual build and clean with the fixed secure recipe
- Preflight checks for required LaTeX tools with OS-specific recovery guidance
- Local PDF tab viewer with refresh and forward/reverse SyncTeX
- Diagnostics and log parsing inside VS Code
- No telemetry, auto build, custom build recipes, external build commands, or browser viewer workflow

## Best For

LaTeX Workspace Security is best for controlled workspaces that need manual LaTeX build, project-local completions, diagnostics, and an in-editor PDF viewer without auto-build or workspace-defined build commands.

> [!IMPORTANT]
> This extension is an independent secure fork and is not the official `James-Yu.latex-workshop` marketplace release. For compatibility, settings and command IDs still use the existing `latex-workshop.*` prefix.

## Requirements

- A local TeX distribution that provides `latexmk` and `pdflatex` is required for local builds.
- `kpsewhich` supports TeX file lookup, and `synctex` supports source/PDF synchronization.
- On macOS, the extension automatically adds the standard MacTeX path `/Library/TeX/texbin` when it exists.
- Build, clean, kill, and reveal-output commands require a trusted, non-virtual workspace.

Run **LaTeX-Secure-Workspace: Show secure build status** from the Command Palette to see the detected tools, versions, execution mode, root file, fixed recipe, and output paths.

## Compared With LaTeX Workshop

| Area | This secure fork |
| --- | --- |
| Keeps | Project-local completions, snippets, hover help, diagnostics, manual build, clean, local PDF tab viewing, and SyncTeX inside the bundled viewer path. |
| Constrains | Build selection, root selection, output paths, Texdoc, formatter/linter helper execution, and compatibility settings that could otherwise expand command execution. |
| Removes | Auto build, custom recipes, custom tools, external build commands, browser viewer workflows, external PDF viewer execution, external SyncTeX commands, Live Share integration, word count, and the math preview panel. |

## Manual

Start with the local secure-fork manual in [docs/manual/README.md](./docs/manual/README.md).

For repository organization and cleanup rules, see [Repository Layout](./docs/manual/repository-layout.md). For the security controls in this fork, see [Security Hardening Summary](./docs/security-hardening.md) or [in Japanese](./docs/security-hardening.ja.md).

## Feature Map

| Workflow | Included behavior |
| --- | --- |
| Editing | Project-local completion for citations, labels, commands, environments, classes, packages, and input paths; snippets, wrapping, outline, and hover help. |
| Build | Explicit manual build with the fixed `secure-latexmk` PDF profile; fixed root and output policy; no workspace-selected command path. |
| Environment | Preflight checks for `latexmk` and `pdflatex`, tool versions in Secure Build Status, standard MacTeX PATH recovery, and targeted missing-resource guidance. |
| PDF | Local VS Code tab viewer with refresh and forward/reverse SyncTeX inside the bundled viewer path. |
| Diagnostics | LaTeX log parsing, Problems-panel diagnostics, graphics checks, compiler log access, and actionable environment failures. |
| Documentation | Texdoc from trusted workspaces with workspace executable overrides blocked and confirmation before launch. |

## Build Behavior

- Build LaTeX documents manually with the fixed internal `secure-latexmk` recipe. The recipe invokes `latexmk` with a fixed PDF-oriented profile and ignores workspace-selected recipes, tools, external build commands, and build-control magic comments.
- Check the required local tools before spawning the build. A missing or broken `latexmk`/`pdflatex` installation stops before compilation and reports macOS, Windows, or Linux recovery guidance.
- Report a missing `.sty`, `.cls`, or related TeX resource directly, with guidance to check project files or the providing TeX package.
- Resolve the build root with a fixed internal policy and always run manual build and clean against the resolved main root file. Secure build and viewer flows do not honor file-level `%!TEX root` comments.
- Write build outputs and auxiliary files into the resolved root file directory, rather than honoring workspace-controlled output-path overrides.
- Open the built PDF in a local VS Code tab using a minimal `pdf.js` runtime, with refresh, forward SyncTeX, and reverse SyncTeX inside the bundled webview path.

## Constrained In This Secure Build

The following surfaces remain present only in a narrowed form.

- Build, clean, kill, and reveal-output commands require a trusted workspace.
- Manual builds use the fixed `secure-latexmk` recipe rather than workspace-selected recipes or tools.
- Auto-build settings are retained for compatibility but cannot start TeX; compilation requires an explicit build command.
- Secure build and viewer flows use the resolved main root file and ignore root-changing magic comments.
- Build outputs and auxiliary files are resolved in the root file directory instead of workspace-controlled output or auxiliary directories.
- Texdoc, formatter, and linter helper commands block workspace-scoped executable overrides and require confirmation before command execution.
- The `external` PDF viewer setting is retained for compatibility, but this secure build still opens PDFs in the internal tab viewer.

## Not Included In This Secure Build

The following upstream features are intentionally disabled or not exposed in this fork.

- Live Share integration.
- Auto build and other file-watcher-triggered build execution.
- Custom recipes, custom tools, and external build commands.
- The internal PDF preview server, browser viewer workflow, external PDF viewer execution, and external SyncTeX command paths.
- Word count and math preview panel workflows.
- Other convenience integrations that expand the executable or network-facing surface without being required for core authoring and compilation.

## Security Note

This fork applies security hardening intended to reduce risk. It does not make arbitrary TeX toolchains safe by itself and does not replace workstation hardening, sandboxing, enterprise policy controls, or adopter validation.

## Release Channels

- Stable releases publish GitHub release tags to the VS Code Marketplace stable channel.
- Daily releases build, test, and package a VSIX every day, refresh the rolling GitHub daily prerelease, and attach open PR, CodeQL, and Dependabot summaries. They do not publish to extension registries.
- The canonical repository fails release publication if the required registry credentials are missing, so security fixes do not silently miss distribution.
- Stable versioning: `1.2.3 -> 1.2.4`, `1.2 -> 1.3.0`
- Stable releases must keep the current major version line. Update the minor or patch version instead of bumping the major version.
- Daily versioning: `1.2.3 -> 1.3.<run_number>`, `1.2 -> 1.3.<run_number>`

Release operations are documented in [RELEASING.md](./RELEASING.md).

## GitHub

The code for this extension is available on GitHub at: https://github.com/thinksyncs/LaTeX-Secure-Workspace

## License

This repository is distributed under the MIT License.

It is an independent fork of LaTeX Workshop and retains the upstream MIT notice in `LICENSE.txt`.

For fork attribution and notice information, see `NOTICE`.

Some bundled data files or third-party assets may carry their own upstream notices in their respective directories.
