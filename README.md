# LaTeX Workspace Security

Secure LaTeX tools for [Visual Studio Code](https://code.visualstudio.com/) with IntelliSense, manual build, diagnostics, and a local PDF tab viewer.

## TL;DR

- IntelliSense for citations, labels, commands, environments, classes, and packages
- Manual build and clean with the fixed secure recipe
- Local PDF tab viewer with one-way refresh
- Diagnostics and log parsing inside VS Code
- No telemetry, auto build, external build commands, or browser viewer workflow

> [!IMPORTANT]
> This extension is an independent secure fork and is not the official `James-Yu.latex-workshop` marketplace release. For compatibility, settings and command IDs still use the existing `latex-workshop.*` prefix.

## Manual

Start with the local secure-fork manual in [docs/manual/README.md](./docs/manual/README.md).

For repository organization and cleanup rules, see [Repository Layout](./docs/manual/repository-layout.md). For the security controls in this fork, see [Security Hardening Summary](./docs/security-hardening.md) or [in Japanese](./docs/security-hardening.ja.md).

## Supported Editing and Build Features

This secure build keeps a focused subset of the upstream editing and compilation workflow.

- Build LaTeX documents manually with the fixed internal build recipe.
- Resolve the build root with a fixed internal policy and always run manual build and clean against the resolved main root file. Secure build and viewer flows do not honor file-level `%!TEX root` comments.
- Write build outputs and auxiliary files into the resolved root file directory, rather than honoring workspace-controlled output-path overrides.
- Open the built PDF in a local VS Code tab using the vendored `vscode-pdfviewer-secure` runtime, with one-way refresh from the extension to the viewer.
- IntelliSense for citations, labels, commands, environments, document classes, packages, and input paths.
- Snippets and text-wrapping commands for common LaTeX authoring tasks.
- Automatic `\item` continuation and other core editing conveniences that stay within the editor process.
- LaTeX log parsing and diagnostics shown directly in VS Code.
- Hover-based assistance for supported LaTeX constructs.

## Not Included In This Secure Build

The following upstream features are intentionally disabled or not exposed in this fork.

- Live Share integration.
- Auto build and other file-watcher-triggered build execution.
- Custom recipes, custom tools, and external build commands.
- Workspace-controlled overrides for build root selection and output or auxiliary directory selection in the secure execution path.
- The internal PDF preview server, browser viewer workflow, reverse or bidirectional viewer messaging, and SyncTeX viewer paths.
- Texdoc, word count, and math preview panel workflows.
- External formatter or linter command overrides from workspace settings without an explicit confirmation prompt.
- Other convenience integrations that expand the executable or network-facing surface without being required for core authoring and compilation.

## GitHub

The code for this extension is available on GitHub at: https://github.com/thinksyncs/LaTeX-Secure-Workspace

## License

This repository is distributed under the MIT License.

It is an independent fork of LaTeX Workshop and retains the upstream MIT notice in `LICENSE.txt`.

For fork attribution and notice information, see `NOTICE`.

Some bundled data files or third-party assets may carry their own upstream notices in their respective directories.

<sub>Disclaimer: This fork applies security hardening intended to reduce risk, but it does not guarantee safety or fitness for any particular environment. It is provided as-is under the MIT License, and maintainers do not assume responsibility for adopter validation, deployment decisions, operational use, or incident response.</sub>
