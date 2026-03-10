import * as path from 'path'
import * as vscode from 'vscode'

import { configurePdfViewerWebview, getPdfViewerHostHtml } from './viewer/pdfviewerpanel'
import { lw } from '../lw'

const logger = lw.log('Viewer', 'CustomEditor')

const VIEW_TYPE = 'tex-workspace-secure.pdf-preview'

export class SecurePdfCustomEditorProvider implements vscode.CustomReadonlyEditorProvider {
    static readonly viewType = VIEW_TYPE

    constructor() {}

    openCustomDocument(uri: vscode.Uri): vscode.CustomDocument {
        return {
            uri,
            dispose: () => undefined
        }
    }

    async resolveCustomEditor(document: vscode.CustomDocument, webviewPanel: vscode.WebviewPanel): Promise<void> {
        const pdfUri = document.uri
        configurePdfViewerWebview(webviewPanel.webview, pdfUri)
        webviewPanel.webview.html = await getPdfViewerHostHtml(pdfUri, webviewPanel.webview)

        webviewPanel.webview.onDidReceiveMessage((msg: unknown) => {
            if (typeof msg !== 'object' || msg === null) {
                return
            }
            const payload = msg as { type?: string, message?: unknown }
            if (payload.type === 'viewer-log' && typeof payload.message === 'string') {
                logger.log(payload.message)
            }
            if (payload.type === 'viewer-loaded') {
                logger.log(`Custom PDF viewer loaded for ${pdfUri.toString(true)}`)
            }
            if (payload.type === 'reload-request') {
                void webviewPanel.webview.postMessage({ type: 'reload-viewer' })
            }
        })

        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(path.dirname(pdfUri.fsPath), path.basename(pdfUri.fsPath))
        )
        const reload = () => {
            void webviewPanel.webview.postMessage({ type: 'reload-viewer' })
        }
        const d1 = watcher.onDidChange(reload)
        const d2 = watcher.onDidCreate(reload)
        const d3 = watcher.onDidDelete(() => {
            webviewPanel.dispose()
        })
        webviewPanel.onDidDispose(() => {
            d1.dispose()
            d2.dispose()
            d3.dispose()
            watcher.dispose()
        })
        logger.log(`Custom PDF editor resolved for ${pdfUri.toString(true)}`)
    }
}

export const securePdfCustomEditorViewType = VIEW_TYPE
