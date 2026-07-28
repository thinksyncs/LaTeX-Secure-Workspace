# Secure Build Manual

This manual collects the local documentation that best matches the current
LaTeX-Secure-Workspace fork.

## What This Build Supports

LaTeX-Secure-Workspace keeps a deliberately small workflow surface:

- Manual pdfLaTeX or LuaLaTeX build with fixed internal recipes
- Root-file detection with the secure root-resolution policy
- On-demand root inspection, project health, and build provenance reports
- Local tab-based PDF viewing with bounded render recovery and forward/reverse SyncTeX
- Project-local completions, safe label rename, snippets, hover help, outline, and diagnostics
- Texdoc from trusted workspaces with command confirmation

The fork intentionally does not expose Live Share integration, browser viewer
flows, internal preview-server workflows, external viewer execution, TeX word
count, or the math preview panel.

## User Quick Start

1. Install a TeX distribution that provides `latexmk` and the LaTeX engine you use (`pdflatex` or `lualatex`).
2. Open the LaTeX project in a trusted local workspace.
3. Open the main document and run **LaTeX-Secure-Workspace: Build LaTeX project** from the Command Palette or the editor build button.
4. For LuaLaTeX, run **LaTeX-Secure-Workspace: Build with recipe** and select `secure-lualatexmk`.
5. Use **LaTeX-Secure-Workspace: Show secure build status** when a tool, root file, output path, or PDF cannot be found.
6. When working in an included fragment, use **Show build root inspector** to review the selected parent and dependency chain, or **Build with project root** to select a detected parent for one build.
7. Run **Check project health** to find project-local missing inputs, graphics, citations, references, and label issues without launching external tools.
8. After a successful build, use **Show build provenance** to review the fixed command, root, output digest, and timing.

On macOS, the extension restores the standard MacTeX path
`/Library/TeX/texbin` for GUI-launched VS Code. On Windows, the TeX Live or
MiKTeX binary directory must be present in the user or system `Path`. On Linux,
the TeX Live binary directory must be present in `PATH`.

Before each local build, the extension checks `latexmk` and the selected engine.
The status report also checks `pdflatex`, `lualatex`, `kpsewhich`, and `synctex`,
shows the detected version line, and provides OS-specific recovery guidance.
Missing `.sty`, `.cls`, and related TeX resources are reported directly with
guidance to check project files or possible distribution packages. The compiler
log remains available for details.

Use VS Code's **Rename Symbol** command (`F2`) on a supported label or reference
to update exact project-local occurrences. Project insight and rename operations
stay inside the open workspace and do not execute LaTeX commands. If direct
LuaLaTeX-only evidence is found after a failed pdfLaTeX build, the extension can
offer a one-time LuaLaTeX build; it does not switch the engine automatically.

When the cursor is on a missing `\input`, `\includegraphics`, or bibliography
path, **Quick Fix** can list same-name candidates that already exist inside the
workspace. No file is changed until a candidate is selected, and the inserted
path is relative to the current document.

The PDF viewer retries a failed page render at most twice and then provides a
manual retry button. Reverse SyncTeX opens a source target only after its real
path is confirmed to remain inside the workspace that owns the PDF.

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
