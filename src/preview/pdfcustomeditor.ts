import * as vscode from 'vscode'

import { getSecurePdfViewerHtml, configureSecurePdfViewerWebview } from './viewer/securepdfviewer'
import { lw } from '../lw'
import type { SyncTeXRecordToPDF, SyncTeXRecordToPDFAll } from '../types'
import type { ClientRequest, PdfViewerState } from '../../types/latex-workshop-protocol-types/index'

const logger = lw.log('Viewer', 'CustomEditor')

const VIEW_TYPE = 'tex-workspace-secure.pdf-preview'
const viewerStates = new Map<string, Map<vscode.WebviewPanel, PdfViewerState>>()
const pendingSyncTeX = new Map<string, SyncTeXRecordToPDF | SyncTeXRecordToPDFAll[]>()
const pendingDeleteDisposals = new Map<vscode.WebviewPanel, NodeJS.Timeout>()
const DELETE_DISPOSE_DELAY_MS = 300

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

        webviewPanel.webview.onDidReceiveMessage((msg: unknown) => {
            void handleCustomEditorMessage(pdfUri, webviewPanel, baseState, msg)
        })
        webviewPanel.webview.html = await getPdfViewerCustomEditorHtml(pdfUri, webviewPanel.webview)

        const watcher = vscode.workspace.createFileSystemWatcher(pdfUri.fsPath)
        const reload = async () => {
            cancelPendingDeleteDisposal(webviewPanel)
            await webviewPanel.webview.postMessage({type: 'reload'})
        }
        const d1 = watcher.onDidChange(reload)
        const d2 = watcher.onDidCreate(reload)
        const d3 = watcher.onDidDelete(() => {
            void schedulePanelDisposeAfterDelete(pdfUri, webviewPanel)
        })
        webviewPanel.onDidDispose(() => {
            cancelPendingDeleteDisposal(webviewPanel)
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

export async function revealLocationInCustomEditor(pdfUri: vscode.Uri, record: SyncTeXRecordToPDF | SyncTeXRecordToPDFAll[]): Promise<boolean> {
    pendingSyncTeX.set(toKey(pdfUri), record)
    const panels = viewerStates.get(toKey(pdfUri))
    if (!panels || panels.size === 0) {
        return false
    }
    for (const panel of panels.keys()) {
        panel.reveal(undefined, true)
    }
    return deliverPendingSyncTeX(pdfUri)
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

async function handleCustomEditorMessage(pdfUri: vscode.Uri, webviewPanel: vscode.WebviewPanel, baseState: PdfViewerState, msg: unknown): Promise<void> {
    if (typeof msg !== 'object' || msg === null) {
        return
    }
    const payload = msg as {
        type?: string,
        message?: unknown,
        state?: PdfViewerState,
        pos?: [number, number],
        page?: number,
        textBeforeSelection?: string,
        textAfterSelection?: string
    }
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
        return
    }
    if (payload.type === 'document-loaded' || payload.type === 'viewer-loaded' || payload.type === 'initialized') {
        logger.log(`Custom PDF viewer loaded for ${pdfUri.toString(true)}`)
        const state = getPanelViewerState(pdfUri, webviewPanel) ?? baseState
        lw.event.fire(lw.event.ViewerPageLoaded)
        lw.event.fire(lw.event.ViewerStatusChanged, state)
        await deliverPendingSyncTeX(pdfUri, webviewPanel)
        return
    }
    if (
        payload.type === 'reverse_synctex'
        && Array.isArray(payload.pos)
        && payload.pos.length === 2
        && typeof payload.pos[0] === 'number'
        && typeof payload.pos[1] === 'number'
        && typeof payload.page === 'number'
    ) {
        await lw.locate.synctex.toTeX(payload as Extract<ClientRequest, { type: 'reverse_synctex' }>, pdfUri)
    }
}

async function deliverPendingSyncTeX(pdfUri: vscode.Uri, panel?: vscode.WebviewPanel): Promise<boolean> {
    const record = pendingSyncTeX.get(toKey(pdfUri))
    if (!record) {
        return false
    }
    const targets = panel
        ? [panel]
        : Array.from(viewerStates.get(toKey(pdfUri))?.keys() ?? [])
    if (targets.length === 0) {
        return false
    }
    const delivered = await Promise.all(targets.map(async target => {
        return target.webview.postMessage({
            type: 'synctex',
            data: record
        })
    }))
    if (delivered.some(result => result)) {
        pendingSyncTeX.delete(toKey(pdfUri))
        return true
    }
    return false
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

// Test helpers await this path, but scheduling itself is synchronous.
// eslint-disable-next-line @typescript-eslint/require-await
async function schedulePanelDisposeAfterDelete(pdfUri: vscode.Uri, panel: vscode.WebviewPanel): Promise<void> {
    cancelPendingDeleteDisposal(panel)
    const timeout = setTimeout(() => {
        pendingDeleteDisposals.delete(panel)
        void confirmDeleteAndDispose(pdfUri, panel)
    }, DELETE_DISPOSE_DELAY_MS)
    pendingDeleteDisposals.set(panel, timeout)
}

function cancelPendingDeleteDisposal(panel: vscode.WebviewPanel): void {
    const timeout = pendingDeleteDisposals.get(panel)
    if (!timeout) {
        return
    }
    clearTimeout(timeout)
    pendingDeleteDisposals.delete(panel)
}

async function confirmDeleteAndDispose(pdfUri: vscode.Uri, panel: vscode.WebviewPanel): Promise<void> {
    try {
        await lw.external.stat(pdfUri)
        await panel.webview.postMessage({type: 'reload'})
        return
    } catch {
        panel.dispose()
    }
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
        pendingSyncTeX.delete(key)
    }
}

/**
 * !! Test only
 */
export function resetCustomEditorStateForTest(): void {
    viewerStates.clear()
    pendingSyncTeX.clear()
    pendingDeleteDisposals.forEach(timeout => clearTimeout(timeout))
    pendingDeleteDisposals.clear()
}

/**
 * !! Test only
 */
export function registerCustomEditorPanelForTest(pdfUri: vscode.Uri, panel: vscode.WebviewPanel, state: PdfViewerState = {}): void {
    updateViewerState(pdfUri, panel, state)
}

/**
 * !! Test only
 */
export async function deliverPendingSyncTeXForTest(pdfUri: vscode.Uri, panel?: vscode.WebviewPanel): Promise<boolean> {
    return deliverPendingSyncTeX(pdfUri, panel)
}

/**
 * !! Test only
 */
export async function handleCustomEditorMessageForTest(pdfUri: vscode.Uri, panel: vscode.WebviewPanel, baseState: PdfViewerState, msg: unknown): Promise<void> {
    await handleCustomEditorMessage(pdfUri, panel, baseState, msg)
}

/**
 * !! Test only
 */
export async function schedulePanelDisposeAfterDeleteForTest(pdfUri: vscode.Uri, panel: vscode.WebviewPanel): Promise<void> {
    await schedulePanelDisposeAfterDelete(pdfUri, panel)
}
