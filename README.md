# LaTeX Workspace Security

**Your documents. Your toolchain. Your decision to build.**

Write research papers, specifications, and technical reports in [Visual Studio Code](https://code.visualstudio.com/) without adopting a hosted document service. Keep the editing tools you need, preview PDFs in the editor, and compile through a deliberately constrained build workflow.

No document-upload service. No extension telemetry. No build on save.

[Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=ToppyMicroServices.tex-workspace-secure) · [Get started](#get-started) · [Enterprise use](#enterprise-use) · [User manual](./docs/manual/README.md)

## Why choose this LaTeX workflow?

Choose it when your team needs to explain **what a document can run, what the build can access, and which artifact is being installed**. The focus is controlled execution, not the largest feature set.

| Your priority | Workflow to consider |
| --- | --- |
| Browser-based coauthoring, shared comments, and a hosted editor | [Overleaf's online service](https://www.overleaf.com/about/features-overview) |
| Flexible VS Code toolchains, custom recipes, and automatic compilation | [Upstream LaTeX Workshop](https://github.com/James-Yu/LaTeX-Workshop/wiki/Compile) |
| Local VS Code authoring, fixed recipes, and explicit build execution | **LaTeX Workspace Security** |

This compares workflow choices, not security rankings. The Overleaf row refers to its online service, not self-hosted deployments. This extension is an independent fork of LaTeX Workshop, not the official `James-Yu.latex-workshop` extension. Settings and command IDs retain the `latex-workshop.*` prefix for compatibility.

## From source to PDF, in one workspace

- **Write and navigate:** project-local completions, snippets, hover help, outlines, and diagnostics.
- **Build when ready:** manual pdfLaTeX and LuaLaTeX builds with fixed recipes and shell escape disabled.
- **Review without switching apps:** a PDF tab with refresh and forward/reverse SyncTeX.
- **Understand failures:** inspect the build root, find missing files and references, rename labels, and view build provenance.

Automatic builds, custom recipes, workspace-defined build commands, external PDF viewers, browser preview, and Live Share are intentionally disabled. Projects that require those features are better served by a different workflow.

## Enterprise use

For teams handling internal reports or unpublished research, the question is often simpler than feature count: *Does this require another cloud service, and what will run on the workstation?*

With a local VS Code workspace and a local container engine, the core editing, build, and preview workflow needs no document upload, cloud account, or hosted compiler. The recommended container build gives IT concrete controls to review:

| Review question | Implemented control |
| --- | --- |
| Can opening or saving a document compile it? | No automatic builds. Build and cleanup require workspace trust; builds use fixed internal recipes with `-no-shell-escape`. Workspace settings and TeX magic comments cannot select arbitrary build commands. |
| Which host files can the container build change? | The owning workspace is mounted read-only. Only `.lw-security` beside the root document is exposed as a writable host output mount. |
| Can the container build contact the network? | The wrapper uses `--network=none` and `--pull=never`. Provision the approved image separately; a build does not pull it automatically. |
| Does PDF preview need a listening server? | No extension preview server or external PDF viewer. The VS Code tab uses bundled viewer assets, with local-resource access limited to the extension directory and the selected PDF's directory. |
| What can we inspect before deployment? | [Stable releases](https://github.com/thinksyncs/LaTeX-Secure-Workspace/releases) provide the VSIX and SPDX SBOM, with build-provenance and SBOM attestations through GitHub. See the [release process](./RELEASING.md). |

**Local access is limited where described, not eliminated.** Editing still reads local files. In trusted workspaces, helpers such as `kpsewhich`, formatters, native SyncTeX, and Texdoc can run on the host; they are outside the container build boundary. Configured format-on-save can invoke a formatter. Optional local pdfLaTeX is also outside that boundary and can read files accessible to your OS account; leave `latex-workshop.security.allowLocalPdfLaTeX` disabled for a container-only build policy.

**The build's network restriction is not a workstation-wide firewall.** Installing or updating VS Code, extensions, and container images may require network access. VS Code's own telemetry, other extensions, Git remotes, remote development, and remote Docker contexts are outside this extension's controls. Use a local workspace and local container engine when local-only document processing is required.

For an IT review, start with the exact extension version, an approved digest-pinned TeX image, and the [security controls](./docs/security-hardening.md) ([Japanese summary](./docs/security-hardening.ja.md)). User Settings keep build policy separate from project-supplied settings, but are not an administrator-enforced policy lock. These controls support an approval decision; approval still depends on your organization's endpoint, container, and data-handling policies.

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

Restricted Mode keeps editor assistance and the local PDF viewer available while build and cleanup remain blocked. Container isolation applies to the TeX build, not the entire VS Code extension host; it does not make arbitrary toolchains or documents safe.

Revision `a8cf9923` received a point-in-time static security review with OpenAI Daybreak Blue (`gpt-daybreak-blue-latest`) on 2026-08-25. It identified a medium-severity host pdfLaTeX file-read risk. Container isolation became the default secure build path; local pdfLaTeX remains an explicit, weaker compatibility option. That review is not a guarantee for later revisions or arbitrary TeX toolchains.

See the [security controls](./docs/security-hardening.md), [Japanese summary](./docs/security-hardening.ja.md), and [vulnerability reporting policy](./SECURITY.md).

## Development and releases

See [Contributing](./CONTRIBUTING.md) for setup and [Testing](./test/README.md) for the test groups. `npm test` runs Node-based checks without opening VS Code. CI also runs isolated VS Code integration tests and real Docker builds.

Stable releases publish to the Marketplace after CI and protected-environment approval. GitHub Releases include the VSIX and SPDX SBOM, with build-provenance and SBOM attestations available through GitHub. Daily previews are GitHub artifacts only. See [Releasing](./RELEASING.md) for the workflow and [Repository layout](./docs/manual/repository-layout.md) for the source structure.

## License

[MIT](./LICENSE.txt), with the upstream LaTeX Workshop notice retained. See [NOTICE](./NOTICE) for attribution; bundled data and third-party assets may have their own notices.
