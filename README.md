# LaTeX Workspace Security

Secure LaTeX tools for [Visual Studio Code](https://code.visualstudio.com/) with project-local completions, manual build, diagnostics, and a local PDF tab viewer with SyncTeX.

## TL;DR

- Project-local completions for citations, labels, commands, packages, and input paths
- Manual local pdfLaTeX build and Docker-isolated LuaLaTeX build with fixed secure recipes
- Preflight checks for required LaTeX tools with OS-specific recovery guidance
- Build-root inspection, project health checks, and build provenance reports
- Local PDF tab viewer with refresh, bounded render recovery, and forward/reverse SyncTeX
- Diagnostics, log parsing, and safe project-wide label rename inside VS Code
- No telemetry, auto build, custom build recipes, external build commands, or browser viewer workflow

## Best For

LaTeX Workspace Security is best for controlled workspaces that need manual LaTeX build, project-local completions, diagnostics, and an in-editor PDF viewer without auto-build or workspace-defined build commands.

> [!IMPORTANT]
> This extension is an independent secure fork and is not the official `James-Yu.latex-workshop` marketplace release. For compatibility, settings and command IDs still use the existing `latex-workshop.*` prefix.

## Requirements

- A local TeX distribution that provides `latexmk` and `pdflatex` is required for local pdfLaTeX builds. Secure LuaLaTeX builds require Docker and a configured `latex-workshop.docker.image.latex` user setting.
- In trusted workspaces, `kpsewhich` supports TeX file lookup and the native `synctex` helper can accelerate forward synchronization. Restricted Mode uses the bundled SyncTeX parser without launching these helpers.
- On macOS, the extension automatically adds the standard MacTeX path `/Library/TeX/texbin` when it exists.
- Build, clean, kill, and reveal-output commands require a trusted, non-virtual workspace.

Run **LaTeX-Secure-Workspace: Show secure build status** from the Command Palette to see the detected tools, versions, execution mode, root file, fixed recipe, and output paths.
Enable Docker in user settings, then use **LaTeX-Secure-Workspace: Build with recipe** and select `secure-lualatexmk` when the document requires LuaLaTeX.

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
| Build | Explicit manual build with fixed `secure-latexmk` (local pdfLaTeX) and `secure-lualatexmk` (Docker-isolated LuaLaTeX) profiles and shell escape disabled; fixed root and output policy; no workspace-selected command path. |
| Project insight | On-demand root candidates and dependency tree, project health checks, and the latest successful build provenance. |
| Environment | Engine-aware preflight checks for `latexmk` and pdfLaTeX or LuaLaTeX, tool versions in Secure Build Status, standard MacTeX PATH recovery, and targeted missing-resource guidance. |
| PDF | Local VS Code tab viewer with refresh, bounded retry after page-render failures, and forward/reverse SyncTeX inside the bundled viewer path. |
| Diagnostics | LaTeX log parsing, Problems-panel diagnostics, project health checks, safe label rename, graphics checks, compiler log access, and actionable environment failures. |
| Documentation | Texdoc from trusted workspaces with workspace executable overrides blocked and confirmation before launch. |

## Project Insight And Repair

- **Show build root inspector** reports the active source, selected root, selection reason, parent candidates, source chain, and project-local input dependency tree without changing files.
- **Build with project root** lets you explicitly select one detected parent document for a single trusted manual build. It does not persist the choice or add a magic comment.
- **Check project health** scans project-local TeX and bibliography files for missing inputs, graphics, citations, references, duplicate labels, and unused labels. It does not run external tools.
- For a missing `\input`, `\includegraphics`, or bibliography path, VS Code Quick Fix offers same-name files found inside the workspace. A path changes only after you select a candidate, and the replacement remains relative to the current document.
- Rename a label with VS Code's **Rename Symbol** command (`F2`). The extension updates exact project-local `\label`, `\ref`, `\eqref`, `\autoref`, `\pageref`, `\cref`, `\Cref`, `\vref`, and `\Vref` references only.
- **Show build provenance** reports the latest successful build's root, fixed recipe command, timestamps, PDF size, and SHA-256 digest. Home-directory prefixes are redacted.
- When a pdfLaTeX build fails and the project contains direct LuaLaTeX evidence such as `fontspec`, the extension offers a one-time **Build with LuaLaTeX** action. It never changes engines silently, and the LuaLaTeX build proceeds only when Docker isolation is enabled.

## Build Behavior

- Build LaTeX documents manually with the fixed internal `secure-latexmk` recipe, or enable Docker and choose `secure-lualatexmk` from **Build with recipe** for LuaLaTeX. Both profiles invoke `latexmk` with `-norc`, `-no-shell-escape`, and SyncTeX output enabled; the LuaLaTeX profile also disables the Lua socket library. They ignore workspace-selected recipes, tools, external build commands, and build-control magic comments. Secure root and output paths are resolved to real project-local directories; outside-workspace subfiles roots and symbolic-link output directories are rejected.
- Check the required runtime before spawning the build. Local pdfLaTeX checks `latexmk` and `pdflatex`; LuaLaTeX checks the configured Docker runtime and image. Missing requirements stop before compilation with targeted guidance.
- Report a missing `.sty`, `.cls`, or related TeX resource directly, with guidance to check project files or the providing TeX package.
- Resolve the build root with a fixed internal policy and always run manual build and clean against the resolved main root file. When the active TeX file is an included fragment, the resolver follows project-local `\input` and `\include` relationships to its parent document; a standalone document remains its own root. Secure build and viewer flows do not honor file-level `%!TEX root` comments.
- Write build outputs and auxiliary files into the resolved root file directory, rather than honoring workspace-controlled output-path overrides.
- Open the built PDF in a local VS Code tab using a minimal `pdf.js` runtime, with refresh, forward SyncTeX, and reverse SyncTeX inside the bundled webview path. A manual build reveals the active source location even when `latexmk` reports that the PDF is already up to date. Failed page renders are retried twice with a bounded delay and expose a manual retry button instead of leaving a black page.

## Constrained In This Secure Build

The following surfaces remain present only in a narrowed form.

- Build, clean, kill, and reveal-output commands require a trusted workspace.
- Manual builds use the fixed `secure-latexmk` or `secure-lualatexmk` recipe rather than workspace-selected recipes or tools. The LuaLaTeX profile runs only through the hardened Docker wrapper.
- Auto-build settings are retained for compatibility but cannot start TeX; compilation requires an explicit build command.
- Secure build and viewer flows use the resolved main root file and ignore root-changing magic comments.
- Build outputs and auxiliary files are resolved in the root file directory instead of workspace-controlled output or auxiliary directories.
- Texdoc and external formatter helpers require a trusted workspace. Workspace-scoped executable and argument overrides are blocked or ignored; Texdoc runs only from an explicit command.
- Restricted Mode skips `kpsewhich`, external formatters, and the native forward SyncTeX helper. Forward SyncTeX falls back to the bundled parser.
- Reverse SyncTeX opens source files only after their real path is confirmed to remain inside the workspace that owns the PDF.
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
- Stable publication waits for approval through the protected `marketplace` GitHub environment.
- Each stable GitHub Release includes the VSIX and its SPDX SBOM; GitHub artifact attestations bind the VSIX to its build provenance and SBOM.
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
