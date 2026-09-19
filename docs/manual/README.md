# Secure Build Manual

This manual collects the local documentation that best matches the current
LaTeX Workspace Security fork.

## What This Build Supports

LaTeX Workspace Security keeps a deliberately small workflow surface:

- Manual local pdfLaTeX or Docker-isolated pdfLaTeX and LuaLaTeX builds with fixed internal recipes
- Root-file detection with the secure root-resolution policy
- On-demand root inspection, project health, and build provenance reports
- Local tab-based PDF viewing with bounded render recovery and forward/reverse SyncTeX
- Project-local completions, safe label rename, snippets, hover help, outline, and diagnostics
- Texdoc from trusted workspaces with command confirmation

The fork intentionally does not expose Live Share integration, browser viewer
flows, internal preview-server workflows, external viewer execution, TeX word
count, or the math preview panel.

## User Quick Start

For a first local pdfLaTeX build, follow the [Docker-free guide](../../resources/local-setup.md): run **Set up local LaTeX**, select **Use Local TeX**, and build the sample. The first **Build LaTeX project** command also offers setup. If tools are missing, **Install Lightweight TeX** offers a separate download confirmation and installs a pinned TinyTeX copy in extension storage. Manual installation and **Check Again** remain available. No JSON editing or Docker installation is needed. A successful build creates `.lw-security/t.pdf` containing `abcd` in a local VS Code tab.

For container isolation or LuaLaTeX, use the [optional Docker setup](#optional-docker-setup) below. For the short introduction, see [Get started](../../README.md#get-started).

The container example has Linux/amd64 CI evidence linked in the walkthrough. Other host platforms and Podman are not covered by that evidence.

After the first PDF:

- For LuaLaTeX, run **LaTeX Workspace Security: Build with recipe** and select `secure-lualatexmk`.
- When working in an included fragment, use **Show build root inspector** to review the parent and dependency chain, or **Build with project root** to select a detected parent for one build.
- Run **Check project health** for missing inputs, graphics, citations, references, and label issues without launching external tools.
- Use **Show build provenance** to review the fixed command, root, output digest, and timing.

### Optional Docker setup

1. Install and start Docker. Run `docker version`; both client and server must respond.
2. Pull the image explicitly. Builds do not download it automatically:

   ```sh
   docker pull texlive/texlive@sha256:bd551dda2195c6830bb714f731d74c4f71cda812178abae15a206fd68b5dbb7c
   ```

3. Open **Preferences: Open User Settings (JSON)** and merge these keys into the existing object. Preserve unrelated settings; workspace settings cannot enable this build mode.

   ```json
   {
     "latex-workshop.docker.enabled": true,
     "latex-workshop.docker.image.latex": "texlive/texlive@sha256:bd551dda2195c6830bb714f731d74c4f71cda812178abae15a206fd68b5dbb7c",
     "latex-workshop.docker.path": "docker"
   }
   ```

4. Build the [first-PDF sample](../../resources/local-setup.md#3-build-a-small-document). Docker mode does not require local `latexmk` or `pdflatex`. The default profile is `secure-latexmk`; choose `secure-lualatexmk` through **Build with recipe** for LuaLaTeX.

This image is pinned in [Linux CI](../../.github/workflows/docker-secure-builds.yml). The recorded [Linux/amd64 run](https://github.com/thinksyncs/LaTeX-Secure-Workspace/actions/runs/34818569833) passed both profiles; it does not establish macOS, Windows, ARM, or Podman compatibility. The image is large, so allow time and disk space for its first download.

Container builds disable networking, mount source files read-only, and write outputs to `.lw-security` beside the root document. Provision an approved image separately.

### Other build modes

For Podman, pull the same image using `podman pull` and set `latex-workshop.docker.path` to `podman` in User Settings. Keep Docker mode enabled. This alternative needs validation on your host; the Docker CI result does not establish Podman compatibility.

For local pdfLaTeX, use the setup above with Docker disabled. Successful setup saves your explicit choice in `latex-workshop.security.allowLocalPdfLaTeX` globally for trusted workspaces. Host TeX can read files available to your OS account; it is not a filesystem sandbox. LuaLaTeX still requires a container. Local setup preserves an existing Docker configuration instead of silently switching it off.

On macOS, the extension restores `/Library/TeX/texbin` for GUI-launched VS Code. On Windows, the TeX Live or MiKTeX binary directory must be in the user or system `Path`; on Linux, the TeX binary directory must be in `PATH`. These host paths are used by the optional local compatibility mode.

## When a build or preview fails

| Symptom | First check | Next step |
| --- | --- | --- |
| Build stopped **before TeX started** | **LaTeX Workspace Security: Show secure build status** | Read the reported blocker. For the Docker path, check the server with `docker version`, then confirm the configured image is already pulled. Check User Settings, not workspace overrides. |
| Wrong root document | **Show build root inspector** | Open the intended main document and build it, or use **Build with project root** to select a detected parent for this build. |
| TeX started but compilation failed | **View LaTeX compiler logs** | Read the first TeX error. Use **Check project health** for project-local missing files; missing distribution packages require an image that contains them. Do not enable shell escape or arbitrary commands as a general workaround. |
| Build succeeded but PDF is missing or blank | **Show secure build status** and the `.lw-security` output path | Run **View PDF**. If the viewer reports a render error, use its retry button. Inspect **View LaTeX Workspace Security messages** if the error persists. |

The command titles above use the English UI. The output channels are **LaTeX Workspace Security** for extension messages and **LaTeX Compiler** for compiler output.

## Settings retained for compatibility

Settings for disabled workflows are marked deprecated rather than removed. VS Code hides these entries from Settings UI unless you have configured them; existing values remain readable and can be removed when no longer needed. Some upstream settings still affect editing or auxiliary-file lookup, so they remain visible. See the [35-setting inventory](../compatibility-settings.md) for the distinction.

## Editing and navigation

Use VS Code's **Rename Symbol** command (`F2`) on a supported label or reference
to update exact project-local occurrences outside comments and verbatim content.
Project insight and rename operations
stay inside the open workspace and do not execute LaTeX commands. If direct
LuaLaTeX-only evidence is found after a failed pdfLaTeX build, the extension can
offer a one-time LuaLaTeX build; it does not switch the engine automatically, and it requires Docker isolation.

When the cursor is on a missing `\input`, `\includegraphics`, or bibliography
path, **Quick Fix** can list same-name candidates that already exist inside the
workspace. No file is changed until a candidate is selected, and the inserted
path is relative to the build root's directory, including when editing a child file.

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
