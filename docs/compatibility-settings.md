# Compatibility settings inventory

Reviewed on 2026-09-17 against the existing secure execution paths. All 35 keys below remain in the manifest with their types, defaults and scopes unchanged.

- **Deprecated (28):** cannot enable or configure the disabled workflow. Some values may still affect diagnostic logging; this is not a claim that the value is never read.
- **Retained (7):** still read by editor root discovery or legacy auxiliary-file lookup. Do not hide these as globally ineffective. Secure execution ignoring a setting does not mean every editor feature ignores it.

This is a source inventory, not a security audit. No runtime code is removed or redirected. The seven retained descriptions are left unchanged in this change; the narrower behavior below is the reason not to deprecate them.

| Setting (prefix `latex-workshop.` omitted) | Decision | Current behavior and source |
| --- | --- | --- |
| `latex.recipes` | Deprecated | [compile/recipe.ts](../src/compile/recipe.ts) getAvailableRecipes and findRecipe return only fixed profiles; no custom tool selection. |
| `latex.recipe.default` | Deprecated | [compile/recipe.ts](../src/compile/recipe.ts) getAvailableRecipes and findRecipe return only fixed profiles; no custom tool selection. |
| `latex.tools` | Deprecated | [compile/recipe.ts](../src/compile/recipe.ts) getAvailableRecipes and findRecipe return only fixed profiles; no custom tool selection. |
| `latex.external.build.command` | Deprecated | [compile/build.ts](../src/compile/build.ts) buildWithResult logs that external commands are ignored and calls the fixed buildRecipe. |
| `latex.external.build.args` | Deprecated | [compile/build.ts](../src/compile/build.ts) buildWithResult logs that external commands are ignored and calls the fixed buildRecipe. |
| `latex.build.enableMagicComments` | Retained | Editor root discovery still calls findFromMagic in [core/root.ts](../src/core/root.ts); secure execution uses resolveSecurityRoot instead. |
| `latex.build.fromWorkspaceFolder` | Deprecated | [compile/recipe.ts](../src/compile/recipe.ts) build fixes cwd to path.dirname(rootUri.fsPath). |
| `latex.outDir` | Retained | [core/file.ts](../src/core/file.ts) getOutDir is still used by legacy file lookup, including getFlsPath. |
| `latex.auxDir` | Retained | [core/file.ts](../src/core/file.ts) getAuxDir is still used by [core/cache.ts](../src/core/cache.ts) and [completion/completer/reference.ts](../src/completion/completer/reference.ts). |
| `latex.jobname` | Retained | [core/file.ts](../src/core/file.ts) getJobname still affects legacy getPdfPath and getFlsPath. |
| `latex.search.rootFiles.include` | Retained | [core/root.ts](../src/core/root.ts) findInWorkspace still reads this during editor root discovery. |
| `latex.search.rootFiles.exclude` | Retained | [core/root.ts](../src/core/root.ts) findInWorkspace still reads this during editor root discovery. |
| `latex.rootFile.useSubFile` | Deprecated | [compile/build.ts](../src/compile/build.ts) buildWithResult ignores skipSelection and uses resolveSecurityRoot, not subfile execution. |
| `latex.rootFile.doNotPrompt` | Deprecated | [compile/build.ts](../src/compile/build.ts) buildWithResult ignores skipSelection and uses resolveSecurityRoot, not subfile execution. |
| `latex.rootFile.indicator` | Retained | [core/root.ts](../src/core/root.ts) getIndicator is still used by editor root discovery. |
| `latex.autoBuild.run` | Deprecated | [compile/build.ts](../src/compile/build.ts) autoBuild never starts TeX; run and ignore values can still affect diagnostic logging, not automatic execution. |
| `latex.autoBuild.interval` | Deprecated | [compile/build.ts](../src/compile/build.ts) autoBuild never starts TeX; run and ignore values can still affect diagnostic logging, not automatic execution. |
| `latex.autoBuild.cleanAndRetry.enabled` | Deprecated | [compile/build.ts](../src/compile/build.ts) autoBuild never starts TeX; run and ignore values can still affect diagnostic logging, not automatic execution. |
| `latex.autoBuild.onSave.files.ignore` | Deprecated | [compile/build.ts](../src/compile/build.ts) autoBuild never starts TeX; run and ignore values can still affect diagnostic logging, not automatic execution. |
| `latex.autoClean.run` | Deprecated | [compile/build.ts](../src/compile/build.ts) afterSuccessfulBuilt refreshes the viewer and caches without invoking clean. |
| `latex.clean.subfolder.enabled` | Deprecated | [extras/cleaner.ts](../src/extras/cleaner.ts) cleanGlob uses a fixed suffix list inside the validated .lw-security directory without configuration-driven execution. |
| `latex.clean.fileTypes` | Deprecated | [extras/cleaner.ts](../src/extras/cleaner.ts) cleanGlob uses a fixed suffix list inside the validated .lw-security directory without configuration-driven execution. |
| `latex.clean.command` | Deprecated | [extras/cleaner.ts](../src/extras/cleaner.ts) cleanGlob uses a fixed suffix list inside the validated .lw-security directory without configuration-driven execution. |
| `latex.clean.args` | Deprecated | [extras/cleaner.ts](../src/extras/cleaner.ts) cleanGlob uses a fixed suffix list inside the validated .lw-security directory without configuration-driven execution. |
| `latex.clean.method` | Deprecated | [extras/cleaner.ts](../src/extras/cleaner.ts) cleanGlob uses a fixed suffix list inside the validated .lw-security directory without configuration-driven execution. |
| `view.pdf.ref.viewer` | Deprecated | [locate/synctex.ts](../src/locate/synctex.ts) shouldUseExternalViewerForForwardSyncTeX always returns false; reference preference cannot select an external viewer. |
| `view.pdf.internal.port` | Deprecated | [preview/viewer.ts](../src/preview/viewer.ts) view opens only the local custom-editor tab; handler ignores websocket messages; no external viewer or HTTP server path. |
| `view.pdf.internal.keyboardEvent` | Deprecated | [preview/viewer.ts](../src/preview/viewer.ts) view opens only the local custom-editor tab; handler ignores websocket messages; no external viewer or HTTP server path. |
| `view.pdf.external.viewer.command` | Deprecated | [preview/viewer.ts](../src/preview/viewer.ts) view opens only the local custom-editor tab; handler ignores websocket messages; no external viewer or HTTP server path. |
| `view.pdf.external.viewer.args` | Deprecated | [preview/viewer.ts](../src/preview/viewer.ts) view opens only the local custom-editor tab; handler ignores websocket messages; no external viewer or HTTP server path. |
| `view.pdf.external.synctex.command` | Deprecated | [locate/synctex.ts](../src/locate/synctex.ts) shouldUseExternalViewerForForwardSyncTeX always returns false; reference preference cannot select an external viewer. |
| `view.pdf.external.synctex.args` | Deprecated | [locate/synctex.ts](../src/locate/synctex.ts) shouldUseExternalViewerForForwardSyncTeX always returns false; reference preference cannot select an external viewer. |
| `synctex.afterBuild.enabled` | Deprecated | [core/commands.ts](../src/core/commands.ts) build calls forward SyncTeX after success when an active source exists, without consulting this setting. |
| `mathpreviewpanel.cursor.enabled` | Deprecated | [core/commands.ts](../src/core/commands.ts) math-preview commands report the feature disabled; src has no reader of these two settings. |
| `mathpreviewpanel.editorGroup` | Deprecated | [core/commands.ts](../src/core/commands.ts) math-preview commands report the feature disabled; src has no reader of these two settings. |
