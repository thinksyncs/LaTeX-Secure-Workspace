# Your first PDF — no Docker needed

Use the TeX tools installed on your computer. Docker is optional for pdfLaTeX; it is still required for LuaLaTeX in this extension. The extension does not install software or download TeX packages for you.

## 1. Check your TeX installation

In a terminal, run:

```sh
latexmk -version
pdflatex --version
```

Both must finish successfully. If they do, keep your existing installation.

- **macOS:** use [MacTeX](https://tug.org/mactex/) or your existing TeX distribution. The extension checks `/Library/TeX/texbin` automatically. Minimal installations may need the `latexmk` package added through their package manager.
- **Windows:** use [TeX Live](https://tug.org/texlive/windows.html) or your existing [MiKTeX](https://miktex.org/howto/install-miktex) installation. Make sure the TeX binaries are on `Path`. If `latexmk` reports a missing Perl interpreter, resolve that tool dependency before retrying. Restart VS Code after changing `Path`.
- **Linux:** use your distribution's TeX Live packages or the [TeX Live installer](https://tug.org/texlive/quickinstall.html). Ensure both `latexmk` and `pdflatex` are on `PATH`; restart VS Code after changing it.

On a managed device, use your organization's approved installation. TeX installation and package updates can require network access. MiKTeX's automatic missing-package installation is controlled by MiKTeX, not this extension.

## 2. Enable local builds

Open a local project folder that you trust. Run **LaTeX Workspace Security: Set up local LaTeX**, then select **Use Local TeX**. No JSON editing is needed. Alternatively, the first **Build LaTeX project** command offers the same setup.

The setup checks the required tools before saving your choice. If a check fails, use **Check Again** after fixing the installation, or rerun setup after restarting VS Code. Cancelling does not enable local execution. Existing Docker settings are not changed.

## 3. Build a small document

Save this as `t.tex` in your project folder:

```latex
\documentclass[12pt]{article}
\begin{document}
  abcd
\end{document}
```

With `t.tex` active, run **LaTeX Workspace Security: Build LaTeX project**. The result is `.lw-security/t.pdf`, opened in a VS Code tab. The page should show `abcd`. Use **View PDF** to reopen it.

If no PDF appears, run **Show secure build status** for tool details or open the extension's output log. A missing `.sty` or `.cls` means a TeX package is unavailable; fix that package installation and build again.

## What you are allowing

Local TeX runs as your OS account and can read files that account can access. Use documents you trust. This is not a filesystem or network sandbox. Builds remain manual and use a fixed recipe with shell escape disabled.

Your choice is saved as `latex-workshop.security.allowLocalPdfLaTeX` in User Settings and applies to all trusted workspaces. Turn it off there to revoke it. Project settings cannot enable this permission. If you require container isolation, configure Docker in User Settings instead.
