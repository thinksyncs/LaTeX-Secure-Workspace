# LaTeX Workspace Security

LaTeX editing, manual builds, and a local PDF viewer for [Visual Studio Code](https://code.visualstudio.com/), with a smaller execution surface than upstream LaTeX Workshop.

This is an independent fork, not the official `James-Yu.latex-workshop` extension. Settings and command IDs retain the `latex-workshop.*` prefix for compatibility.

Use it when you want to edit locally and start fixed-recipe builds yourself. It is not a fit for workflows that depend on automatic builds, custom recipes, or arbitrary build commands.

[Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=ToppyMicroServices.tex-workspace-secure) · [User manual](./docs/manual/README.md) · [Releases](https://github.com/thinksyncs/LaTeX-Secure-Workspace/releases)

## What you can do

- Write with project-local completions, snippets, hover help, outlines, and diagnostics.
- Build pdfLaTeX or LuaLaTeX manually with fixed recipes and shell escape disabled.
- Read PDFs in a VS Code tab with refresh and forward/reverse SyncTeX.
- Inspect the build root, check missing files and references, rename labels, and view build provenance.

There is no telemetry or automatic build. Custom recipes, workspace-defined build commands, external PDF viewers, browser preview, and Live Share are disabled.

## Get started

The example below uses Docker and the digest-pinned TeX Live image in our [Linux CI](./.github/workflows/docker-secure-builds.yml). The recorded [Linux/amd64 run](https://github.com/thinksyncs/LaTeX-Secure-Workspace/actions/runs/34818569833) passed both fixed engine profiles. This is not a claim of verification on macOS, Windows, ARM, or Podman. The image is large; allow time and disk space for the first download.

1. Install the extension and install/start Docker. Run `docker version` in a terminal; both the client and server must respond.
2. Pull the image explicitly. Builds do not download it automatically:

   ```sh
   docker pull texlive/texlive@sha256:bd551dda2195c6830bb714f731d74c4f71cda812178abae15a206fd68b5dbb7c
   ```

3. Open **Preferences: Open User Settings (JSON)** and merge these keys into the existing object. Do not replace unrelated settings or put these keys in workspace settings:

   ```json
   {
     "latex-workshop.docker.enabled": true,
     "latex-workshop.docker.image.latex": "texlive/texlive@sha256:bd551dda2195c6830bb714f731d74c4f71cda812178abae15a206fd68b5dbb7c",
     "latex-workshop.docker.path": "docker"
   }
   ```

4. Open an empty local folder in VS Code, trust the folder you created, and save the following as `t.tex`. This is the existing [onboarding sample](./samples/sample/t.tex):

   ```latex
   \documentclass[12pt]{article}
   \begin{document}
     abcd
   \end{document}
   ```

5. With `t.tex` active, run **LaTeX Workspace Security: Build LaTeX project**. A successful build creates `.lw-security/t.pdf` and opens it in a VS Code tab. Check that the page shows `abcd`. If the tab was closed, run **LaTeX Workspace Security: View PDF**.

Command names above are the English UI labels; translated VS Code installations may show localized titles.

The default recipe is `secure-latexmk` (pdfLaTeX). For LuaLaTeX, run **Build with recipe** and select `secure-lualatexmk`.

Container builds disable networking, mount the workspace read-only, and write outputs to `.lw-security` beside the root document.

For Podman and the optional local mode, see the [manual](./docs/manual/README.md#other-build-modes). Neither is needed for the Docker walkthrough above.

### Without Docker — pdfLaTeX only

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
