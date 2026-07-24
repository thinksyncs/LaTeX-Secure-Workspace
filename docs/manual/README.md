# Secure Build Manual

This manual collects the local documentation that best matches the current
LaTeX-Secure-Workspace fork.

## What This Build Supports

LaTeX-Secure-Workspace keeps a deliberately small workflow surface:

- Manual LaTeX build with the fixed internal recipe
- Root-file detection with the secure root-resolution policy
- Local tab-based PDF viewing with refresh and forward/reverse SyncTeX
- Project-local completions, snippets, hover help, outline, and diagnostics
- Texdoc from trusted workspaces with command confirmation

The fork intentionally does not expose Live Share integration, browser viewer
flows, internal preview-server workflows, external viewer execution, TeX word
count, or the math preview panel.

## User Quick Start

1. Install a TeX distribution that provides `latexmk` and `pdflatex`.
2. Open the LaTeX project in a trusted local workspace.
3. Open the main document and run **LaTeX-Secure-Workspace: Build LaTeX project** from the Command Palette or the editor build button.
4. Use **LaTeX-Secure-Workspace: Show secure build status** when a tool, root file, output path, or PDF cannot be found.

On macOS, the extension restores the standard MacTeX path
`/Library/TeX/texbin` for GUI-launched VS Code. On Windows, the TeX Live or
MiKTeX binary directory must be present in the user or system `Path`. On Linux,
the TeX Live binary directory must be present in `PATH`.

Before each local build, the extension checks `latexmk` and `pdflatex`. The
status report also checks `kpsewhich` and `synctex`, shows the detected version
line, and provides OS-specific recovery guidance. Missing `.sty`, `.cls`, and
related TeX resources are reported directly with guidance to check project
files or possible distribution packages. The compiler log remains available
for details.

## Reading Order

Start here when you need the current secure-fork behavior:

1. [Repository layout](./repository-layout.md)
2. [Security hardening summary](../security-hardening.md)
3. [Security hardening summary (Japanese)](../security-hardening.ja.md)

Upstream pages are still useful for shared editing concepts, but treat any page
that mentions SyncTeX, browser preview, custom tools, custom recipes, Live
Share, or preview-server behavior as upstream-only reference material.

## Development Quick Start

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
