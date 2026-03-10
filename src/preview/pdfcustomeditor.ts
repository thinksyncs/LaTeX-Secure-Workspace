import * as fs from 'fs/promises'
import * as path from 'path'
import * as vscode from 'vscode'

import { configurePdfViewerWebview } from './viewer/pdfviewerpanel'
import { lw } from '../lw'
import type { PdfViewerState } from '../../types/latex-workshop-protocol-types/index'

const logger = lw.log('Viewer', 'CustomEditor')

const VIEW_TYPE = 'tex-workspace-secure.pdf-preview'
const viewerStates = new Map<string, Map<vscode.WebviewPanel, PdfViewerState>>()

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
        const baseState: PdfViewerState = {
            path: pdfUri.fsPath,
            pdfFileUri: pdfUri.toString(true)
        }
        configurePdfViewerWebview(webviewPanel.webview, pdfUri)
        updateViewerState(pdfUri, webviewPanel, baseState)
        webviewPanel.webview.html = await getPdfViewerCustomEditorHtml(pdfUri, webviewPanel.webview)

        webviewPanel.webview.onDidReceiveMessage((msg: unknown) => {
            if (typeof msg !== 'object' || msg === null) {
                return
            }
            const payload = msg as { type?: string, message?: unknown, state?: PdfViewerState }
            if ((payload.type === 'viewer-log' || payload.type === 'log') && typeof payload.message === 'string') {
                logger.log(payload.message)
            }
            if (payload.type === 'state' && payload.state && typeof payload.state === 'object') {
                const nextState = {
                    ...baseState,
                    ...payload.state
                }
                updateViewerState(pdfUri, webviewPanel, nextState)
                lw.event.fire(lw.event.ViewerStatusChanged, nextState)
            }
            if (payload.type === 'viewer-loaded' || payload.type === 'initialized') {
                logger.log(`Custom PDF viewer loaded for ${pdfUri.toString(true)}`)
                const state = getPanelViewerState(pdfUri, webviewPanel) ?? baseState
                lw.event.fire(lw.event.ViewerPageLoaded)
                lw.event.fire(lw.event.ViewerStatusChanged, state)
            }
        })

        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(path.dirname(pdfUri.fsPath), path.basename(pdfUri.fsPath))
        )
        const reload = async () => {
            webviewPanel.webview.html = await getPdfViewerCustomEditorHtml(pdfUri, webviewPanel.webview)
        }
        const d1 = watcher.onDidChange(reload)
        const d2 = watcher.onDidCreate(reload)
        const d3 = watcher.onDidDelete(() => {
            webviewPanel.dispose()
        })
        webviewPanel.onDidDispose(() => {
            deleteViewerState(pdfUri, webviewPanel)
            d1.dispose()
            d2.dispose()
            d3.dispose()
            watcher.dispose()
        })
        logger.log(`Custom PDF editor resolved for ${pdfUri.toString(true)}`)
    }
}

export const securePdfCustomEditorViewType = VIEW_TYPE
export function getCustomEditorStates(pdfUri: vscode.Uri): PdfViewerState[] {
    return Array.from(viewerStates.get(toKey(pdfUri))?.values() ?? [])
}

async function getPdfViewerCustomEditorHtml(pdfUri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    const nonce = getNonce()
    const extensionRoot = lw.file.toUri(lw.extensionRoot)
    const viewerRoot = vscode.Uri.joinPath(extensionRoot, 'viewer')
    const viewerHtmlPath = path.join(lw.extensionRoot, 'viewer', 'viewer.html')
    const pdfWebviewUri = webview.asWebviewUri(pdfUri).toString()
    const docTitle = path.basename(pdfUri.fsPath) || 'Untitled PDF'
    const params = lw.viewer.getParams()

    const viewerCssUri = webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'viewer.css')).toString()
    const latexWorkshopCssUri = webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'latexworkshop.css')).toString()
    const localeUri = webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'locale', 'locale.json')).toString()
    const bootstrapUri = webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'bootstrap.js')).toString()

    let html = await fs.readFile(viewerHtmlPath, 'utf8')
    html = html.replace(
        /<meta http-equiv="Content-Security-Policy" content="[^"]*">/,
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; connect-src ${webview.cspSource} ws://127.0.0.1:*; style-src ${webview.cspSource} 'unsafe-inline'; img-src ${webview.cspSource} data: blob:; font-src ${webview.cspSource}; script-src ${webview.cspSource} 'nonce-${nonce}'; worker-src ${webview.cspSource} blob:;">`
    )
    html = html.replace('href="locale/locale.json"', `href="${localeUri}"`)
    html = html.replace('href="viewer.css"', `href="${viewerCssUri}"`)
    html = html.replace('href="latexworkshop.css"', `href="${latexWorkshopCssUri}"`)
    html = html.replace(
        '<script src="bootstrap.js" type="module"></script>',
        `<script nonce="${nonce}">
  globalThis.lwPdfUri = ${JSON.stringify(pdfWebviewUri)};
  globalThis.lwDocTitle = ${JSON.stringify(docTitle)};
  globalThis.lwParams = ${JSON.stringify(params)};
</script>
<script nonce="${nonce}" src="${bootstrapUri}" type="module"></script>`
    )
    return html
}

function getNonce(): string {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}

function toKey(pdfUri: vscode.Uri): string {
    return pdfUri.toString(true).toLocaleUpperCase()
}

function getOrCreateViewerStateMap(pdfUri: vscode.Uri): Map<vscode.WebviewPanel, PdfViewerState> {
    const key = toKey(pdfUri)
    let panelStates = viewerStates.get(key)
    if (!panelStates) {
        panelStates = new Map<vscode.WebviewPanel, PdfViewerState>()
        viewerStates.set(key, panelStates)
    }
    return panelStates
}

function updateViewerState(pdfUri: vscode.Uri, panel: vscode.WebviewPanel, state: PdfViewerState): void {
    getOrCreateViewerStateMap(pdfUri).set(panel, state)
}

function getPanelViewerState(pdfUri: vscode.Uri, panel: vscode.WebviewPanel): PdfViewerState | undefined {
    return viewerStates.get(toKey(pdfUri))?.get(panel)
}

function deleteViewerState(pdfUri: vscode.Uri, panel: vscode.WebviewPanel): void {
    const key = toKey(pdfUri)
    const panelStates = viewerStates.get(key)
    if (!panelStates) {
        return
    }
    panelStates.delete(panel)
    if (panelStates.size === 0) {
        viewerStates.delete(key)
    }
}
