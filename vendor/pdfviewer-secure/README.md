# Vendored `vscode-pdfviewer-secure`

This repository uses a vendored snapshot of the PDF viewer runtime from
`thinksyncs/vscode-pdfviewer-secure`.

- Source repository: `https://github.com/thinksyncs/vscode-pdfviewer-secure`
- Snapshot commit: `9d1fe945cae0070d1dbe354968b01ef23569a008`

Boundaries:

- `viewer/lib/`: upstream runtime assets copied from the secure PDF viewer repo
- `vendor/pdfviewer-secure/src/`: upstream TypeScript sources kept for sync and rebundling
- `src/preview/`: LaTeX-Secure-Workspace-specific adapter code only

Sync procedure:

1. Refresh `viewer/lib/` from the upstream secure PDF viewer `lib/` directory.
2. Refresh `vendor/pdfviewer-secure/src/config.ts`.
3. Refresh `vendor/pdfviewer-secure/src/webview/main.ts`.
4. Keep `vendor/pdfviewer-secure/src/webview/entry.ts` as the local adapter entry.
5. Run `npm run compile` to rebuild `out/vendor/pdfviewer-secure/webview/main.js`.
