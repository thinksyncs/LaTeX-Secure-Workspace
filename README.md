# LaTeX Workspace Security

[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/14764/badge)](https://www.bestpractices.dev/projects/14764)

**Write LaTeX. Build on your terms. No Docker required for your first PDF.**

Edit papers and technical reports in VS Code, build with your installed TeX tools, and preview PDFs without leaving the editor. No hosted compiler, document-upload service, or extension telemetry.

[Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=ToppyMicroServices.tex-workspace-secure) · [Setup guide](./resources/local-setup.md) · [Manual](./docs/manual/README.md)

## Why this extension?

- **An editor-to-PDF workflow:** completions, navigation, label rename, diagnostics, and PDF preview with SyncTeX.
- **You decide when to build:** no build on save, fixed recipes, shell escape disabled, and no project-defined build commands.
- **Choose your build boundary:** local pdfLaTeX after explicit consent, or optional Docker isolation. LuaLaTeX requires Docker.

This independent LaTeX Workshop fork trades custom toolchains and automatic compilation for a smaller, controlled workflow. It is not the official upstream extension.

## Get started

1. Install the extension. Keep your existing TeX, or let setup install a lightweight copy after your approval.
2. Open a local folder you trust and save this as `t.tex`:

   ```latex
   \documentclass[12pt]{article}
   \begin{document}
     abcd
   \end{document}
   ```

3. Run **LaTeX Workspace Security: Build LaTeX project** and choose **Use Local TeX**. Setup checks the tools, then builds and opens `.lw-security/t.pdf`.

Missing tools? Choose **Install Lightweight TeX**, select the lightweight or Japanese-font profile, then approve the download. Setup installs TinyTeX and continues the build. No admin rights or OS PATH edits are requested. See the [setup guide](./resources/local-setup.md).

Local TeX runs as your OS account, outside a sandbox. Use trusted documents; your consent applies to all trusted workspaces and can be revoked in User Settings. For isolation or LuaLaTeX, follow the [Docker setup](./docs/manual/README.md#optional-docker-setup).

## Enterprise use

Local editing, building, and preview need no cloud account or document upload. There is no extension preview server. Optional Docker builds disable networking, mount source files read-only, and limit writable host output to `.lw-security`.

These controls do not isolate the whole extension or guarantee IT approval: local helpers can run, installation may need network access, and VS Code and other extensions have their own behavior. See the [security boundaries](./docs/security-hardening.md) ([日本語](./docs/security-hardening.ja.md)) for an IT review.

[Stable releases](https://github.com/thinksyncs/LaTeX-Secure-Workspace/releases) include the VSIX, SPDX SBOM, and GitHub attestations for deployment review.

## Project

We want LaTeX to be easier to use at work, with less setup and less need to justify a choice of tool. Clear mathematics and careful typesetting matter to us, alongside Word, Markdown, and AI-assisted workflows—and respect for your organization's policies.

[Contributing](./CONTRIBUTING.md) · [Tests](./test/README.md) · [Releases](./RELEASING.md) · [Report a vulnerability](./SECURITY.md)

[MIT](./LICENSE.txt). Upstream and third-party attribution: [NOTICE](./NOTICE).
