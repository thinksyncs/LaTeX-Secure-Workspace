# Your first PDF — no Docker needed

Use your existing TeX tools, or approve a lightweight TinyTeX installation from setup. Docker is optional for pdfLaTeX; it is still required for LuaLaTeX. No download starts just because you open VS Code or a document.

## 1. Check your TeX installation

In a terminal, run:

```sh
latexmk -version
pdflatex --version
```

Both must finish successfully to use your existing installation. If they do, keep it. Otherwise, skip to setup below and choose **Install Lightweight TeX**, or install TeX manually:

- **macOS:** use [MacTeX](https://tug.org/mactex/) or your existing TeX distribution. The extension checks `/Library/TeX/texbin` automatically. Minimal installations may need the `latexmk` package added through their package manager.
- **Windows:** use [TeX Live](https://tug.org/texlive/windows.html) or your existing [MiKTeX](https://miktex.org/howto/install-miktex) installation. Make sure the TeX binaries are on `Path`. If `latexmk` reports a missing Perl interpreter, resolve that tool dependency before retrying. Restart VS Code after changing `Path`.
- **Linux:** use your distribution's TeX Live packages or the [TeX Live installer](https://tug.org/texlive/quickinstall.html). Ensure both `latexmk` and `pdflatex` are on `PATH`; restart VS Code after changing it.

On a managed device, use your organization's approved installation. TeX installation and package updates can require network access. MiKTeX's automatic missing-package installation is controlled by MiKTeX, not this extension.

## 2. Enable local builds

Open a local project folder that you trust. Run **LaTeX Workspace Security: Set up local LaTeX**, then select **Use Local TeX**. No JSON editing is needed. Alternatively, the first **Build LaTeX project** command offers the same setup.

The setup checks the tools before saving your choice. If they are missing, choose **Install Lightweight TeX**, select a profile below, then **Download and Install** after reviewing the source, size, and destination. A progress notification supports cancellation. After installation, setup checks the tools again and continues your requested build. Cancelling does not enable local execution. Existing Docker settings are not changed.

- **Lightweight TeX:** the small TinyTeX-1 base for standard pdfLaTeX documents.
- **Japanese TeX — 日本語:** the same base plus CJK and IPAex Mincho/Gothic fonts (about 15 MiB extra). Includes font licenses and a [Japanese sample](./sample-japanese.tex). Fonts are installed only inside managed TeX, not into the OS font library.

To install or switch profiles later, run **Install or select TeX (Lightweight / Japanese)**. Each profile has its own directory; a completed installation is reused without another download. Disable `security.useManagedTeX` in User Settings to use existing system TeX instead.

The installer downloads pinned [TinyTeX-1 v2026.09](https://github.com/rstudio/tinytex-releases/releases/tag/v2026.09) (about 51–71 MiB compressed, depending on OS) into this extension's VS Code global storage. It verifies SHA-256 before extraction, does not change OS PATH or remove another TeX installation, and never automatically updates or downloads missing LaTeX packages. The managed copy is used for this extension's builds, not installed as a system command. [TinyTeX licensing and distribution details](https://github.com/rstudio/tinytex-releases#license) apply.

Japanese support is downloaded from the [CTAN TeX Live mirror](https://ctan.net/systems/texlive/tlnet/archive/), with each archive's size and SHA-256 pinned. If the mirror replaces an archive, installation stops until a reviewed extension update pins the new bytes. The supplied sample uses pdfLaTeX/CJK. Existing LuaLaTeX documents (such as `ltjsarticle`) still require the Docker workflow; selecting Japanese fonts does not change this execution boundary.

Supported targets: macOS Intel/Apple Silicon, Windows x64, Linux glibc x64/arm64, and Alpine Linux x64. Unix needs system Perl at `/usr/bin/perl` and tar (with xz support); Windows uses the verified self-extracting archive and its built-in `System32\tar.exe` for Japanese packages. Windows installation paths containing non-ASCII characters and remote VS Code hosts are not supported by this installer; use an approved existing TeX installation there. Native Windows ARM is not covered.

To remove a managed copy, close VS Code and remove only its `tinytex` or `tinytex-japanese` directory at the exact destination shown in the installation confirmation. Do not delete the parent global-storage directory.

For blocked downloads or missing system tools, use **Installation Guide** for the manual route, then **Check Again**. A crash may leave `tinytex-install.lock` in the same extension storage: remove only that empty lock directory after closing all VS Code windows and confirming no installation is running. Incomplete existing `tinytex` directories are not overwritten automatically. A partial download in private staging is removed on a handled failure or cancellation.

## 3. Build a small document

Save this as `t.tex` in your project folder:

```latex
\documentclass[12pt]{article}
\begin{document}
  abcd
\end{document}
```

With `t.tex` active, run **LaTeX Workspace Security: Build LaTeX project**. The result is `.lw-security/t.pdf`, opened in a VS Code tab. The page should show `abcd`. Use **View PDF** to reopen it.

For Japanese, select the Japanese profile and save the [Japanese sample](./sample-japanese.tex) into your project. Build it with the same command. It includes both Mincho and Gothic text and needs no separately installed OS fonts.

If no PDF appears, run **Show secure build status** for tool details or open the extension's output log. A missing `.sty` or `.cls` means a TeX package is unavailable; fix that package installation and build again.

## What you are allowing

Local TeX runs as your OS account and can read files that account can access. Use documents you trust. This is not a filesystem or network sandbox. Builds remain manual and use a fixed recipe with shell escape disabled.

Your choice is saved as `latex-workshop.security.allowLocalPdfLaTeX` in User Settings and applies to all trusted workspaces. Turn it off there to revoke it. Project settings cannot enable this permission or select the managed toolchain. If you require container isolation, configure Docker in User Settings instead. Managed TinyTeX is a convenience installation, not a sandbox or an IT-approval bypass.
