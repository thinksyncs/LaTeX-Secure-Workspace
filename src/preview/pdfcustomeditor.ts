import * as vscode from 'vscode'

import { getSecurePdfViewerHtml, configureSecurePdfViewerWebview } from './viewer/securepdfviewer'
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
        configureSecurePdfViewerWebview(webviewPanel.webview, pdfUri)
        updateViewerState(pdfUri, webviewPanel, baseState)
        webviewPanel.webview.html = await getPdfViewerCustomEditorHtml(pdfUri, webviewPanel.webview)

        webviewPanel.webview.onDidReceiveMessage((msg: unknown) => {
            if (typeof msg !== 'object' || msg === null) {
                return
            }
            const payload = msg as { type?: string, message?: unknown, state?: PdfViewerState }
            if ((payload.type === 'viewer-log' || payload.type === 'log' || payload.type === 'document-error') && typeof payload.message === 'string') {
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
            if (payload.type === 'document-loaded' || payload.type === 'viewer-loaded' || payload.type === 'initialized') {
                logger.log(`Custom PDF viewer loaded for ${pdfUri.toString(true)}`)
                const state = getPanelViewerState(pdfUri, webviewPanel) ?? baseState
                lw.event.fire(lw.event.ViewerPageLoaded)
                lw.event.fire(lw.event.ViewerStatusChanged, state)
            }
        })

        const watcher = vscode.workspace.createFileSystemWatcher(pdfUri.fsPath)
        const reload = async () => {
            await webviewPanel.webview.postMessage({type: 'reload'})
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

export async function reloadCustomEditorPanels(pdfUri?: vscode.Uri): Promise<void> {
    const targets = pdfUri
        ? [[pdfUri, viewerStates.get(toKey(pdfUri))] as const]
        : Array.from(viewerStates.entries()).map(([uri, states]) => [vscode.Uri.parse(uri), states] as const)
    for (const [targetPdfUri, panelStates] of targets) {
        if (!panelStates) {
            continue
        }
        await Promise.all(Array.from(panelStates.keys()).map(async panel => {
            panel.webview.html = await getPdfViewerCustomEditorHtml(targetPdfUri, panel.webview)
        }))
    }
}

async function getPdfViewerCustomEditorHtml(pdfUri: vscode.Uri, webview: vscode.Webview): Promise<string> {
    return getSecurePdfViewerHtml(pdfUri, webview, lw.viewer.getParams())
}

function toKey(pdfUri: vscode.Uri): string {
    return pdfUri.toString(true)
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
