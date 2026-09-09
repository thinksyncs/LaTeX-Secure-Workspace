# LaTeX Workspace Security

LaTeX editing, manual builds, and a local PDF viewer for [Visual Studio Code](https://code.visualstudio.com/), with a smaller execution surface than upstream LaTeX Workshop.

This is an independent fork, not the official `James-Yu.latex-workshop` extension. Settings and command IDs retain the `latex-workshop.*` prefix for compatibility.

[Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=ToppyMicroServices.tex-workspace-secure) · [User manual](./docs/manual/README.md) · [Releases](https://github.com/thinksyncs/LaTeX-Secure-Workspace/releases)

## What you can do

- Write with project-local completions, snippets, hover help, outlines, and diagnostics.
- Build pdfLaTeX or LuaLaTeX manually with fixed recipes and shell escape disabled.
- Read PDFs in a VS Code tab with refresh and forward/reverse SyncTeX.
- Inspect the build root, check missing files and references, rename labels, and view build provenance.

There is no telemetry or automatic build. Custom recipes, workspace-defined build commands, external PDF viewers, browser preview, and Live Share are disabled.

## Get started

1. Install the extension and open a LaTeX project in a trusted, local workspace.
2. Choose a build mode below.
3. Run **LaTeX-Secure-Workspace: Build LaTeX project** from the Command Palette or the editor build button.

**Docker or Podman — pdfLaTeX and LuaLaTeX**

Install the container runtime and configure these settings in VS Code **User Settings**:

| Setting | Value |
| --- | --- |
| `latex-workshop.docker.enabled` | `true` |
| `latex-workshop.docker.image.latex` | A trusted LaTeX image containing `latexmk` and the required TeX packages |
| `latex-workshop.docker.path` | `docker` (default), or `podman` |

The default recipe is `secure-latexmk` (pdfLaTeX). For LuaLaTeX, run **Build with recipe** and select `secure-lualatexmk`.

Container builds disable networking, mount the workspace read-only, and write outputs to `.lw-security` beside the root document.

**Without Docker — pdfLaTeX only**

Install a local TeX distribution with `latexmk`. With Docker disabled, a build shows a security warning before TeX starts. Choose **Yes** to enable `latex-workshop.security.allowLocalPdfLaTeX` in User Settings and continue, or **No** to leave the build blocked.

Use this mode only for documents you fully trust: host TeX can read files available to your OS account. The setting applies to all trusted workspaces, not just the current document, and can be turned off in User Settings. LuaLaTeX still requires container isolation.

## When a build does not work

Run **Show secure build status** to check the execution mode, tools, root file, and output paths. A warning that says the build stopped *before TeX started* means the security policy blocked execution; it is not a TeX compilation error.

Use **Show build root inspector** if the wrong document is selected, or **Check project health** for missing inputs, graphics, citations, and references. The [manual](./docs/manual/README.md) covers these commands, PDF viewing, and platform setup.

## Security

Build and cleanup require workspace trust. Build recipes and output paths are fixed; workspace settings and TeX magic comments cannot choose arbitrary build commands. Restricted Mode keeps editor assistance and the local PDF viewer available.

Revision `a8cf9923` received a point-in-time static security review with OpenAI Daybreak Blue (`gpt-daybreak-blue-latest`) on 2026-08-25. It identified a medium-severity host pdfLaTeX file-read risk. Container isolation became the default secure build path; local pdfLaTeX remains an explicit, weaker compatibility option. That review is not a guarantee for later revisions or arbitrary TeX toolchains.

See the [security controls](./docs/security-hardening.md), [Japanese summary](./docs/security-hardening.ja.md), and [vulnerability reporting policy](./SECURITY.md).

## Development and releases

See [Contributing](./CONTRIBUTING.md) for setup and [Testing](./test/README.md) for the test groups. `npm test` runs Node-based checks without opening VS Code. CI also runs isolated VS Code integration tests and real Docker builds.

Stable releases publish to the Marketplace after CI and protected-environment approval. GitHub Releases include the VSIX and SPDX SBOM, with build-provenance and SBOM attestations available through GitHub. Daily previews are GitHub artifacts only. See [Releasing](./RELEASING.md) for the workflow and [Repository layout](./docs/manual/repository-layout.md) for the source structure.

## License

[MIT](./LICENSE.txt), with the upstream LaTeX Workshop notice retained. See [NOTICE](./NOTICE) for attribution; bundled data and third-party assets may have their own notices.
