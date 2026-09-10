# Source overview

`main.ts` locates the extension root and loads `app.ts`. The latter initializes
modules, registers commands and language providers, and handles editor events.
Modules share services through the `lw` object in `lw.ts`.

| Area | Entry points |
| --- | --- |
| Root discovery, file tracking, and project inspection | `core/root.ts`, `core/cache.ts`, `core/project-insight.ts` |
| Manual builds and fixed recipes | `core/commands.ts`, `compile/build.ts`, `compile/recipe.ts` |
| Completion, navigation, rename, and path fixes | `completion/`, `language/` |
| Diagnostics and formatting | `lint/` |
| PDF tabs and SyncTeX | `preview/pdfcustomeditor.ts`, `locate/synctex.ts` |

The build command resolves a project-local root and checks workspace trust and
execution settings before running a fixed recipe. Saving or changing a file
updates editor assistance; automatic builds are disabled.

PDF tabs use the webview in `resources/pdfviewer/` and the bundled PDF.js runtime.
The snippet view uses local webview resources through `extras/snippet-view.ts`.
Parser work runs through `parse/parser.ts` and its worker in
`parse/parser/unified.ts`. MathJax work runs through `preview/mathjax.ts` and
`preview/mathjax/mathjax.ts`.

Use `lw.log(...)` for extension logs and `core/event.ts` for shared events.
See the [repository layout](../docs/manual/repository-layout.md),
[security controls](../docs/security-hardening.md), and
[test guide](../test/README.md) for the broader development workflow.
