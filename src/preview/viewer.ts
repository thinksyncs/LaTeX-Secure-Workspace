import * as vscode from 'vscode'
import ws from 'ws'
import * as path from 'path'
import { lw } from '../lw'
import type { SyncTeXRecordToPDF, SyncTeXRecordToPDFAll } from '../types'
import type { PdfViewerParams, PdfViewerState } from '../../types/latex-workshop-protocol-types/index'
import { getCustomEditorStates, securePdfCustomEditorViewType } from './pdfcustomeditor'

const logger = lw.log('Viewer')

export {
    getParams,
    getViewerState,
    handler,
    isViewing,
    locate,
    viewInWebviewPanel,
    refresh,
    view
}

lw.watcher.pdf.onChange(pdfUri => {
    if (lw.compile.compiledPDFWriting === 0 || path.relative(lw.compile.compiledPDFPath, pdfUri.fsPath) !== '') {
        refresh(pdfUri)
    }
})
lw.onConfigChange(['view.pdf.toolbar.hide.timeout', 'view.pdf.invert', 'view.pdf.invertMode', 'view.pdf.color', 'view.pdf.internal', 'view.pdf.reload.transition'], () => {
    reload()
})

const isViewing = (fileUri: vscode.Uri) => getViewerState(fileUri).length > 0

function reload(): void {
    logger.log('PDF tab viewer parameters changed. Open editors will pick up new settings on reload.')
}

/**
 * Refreshes PDF viewers of `pdfFile`.
 *
 * @param pdfFile The path of a PDF file. If `pdfFile` is `undefined`,
 * refreshes all the PDF viewers.
 */
function refresh(pdfUri?: vscode.Uri): void {
    void pdfUri
}

async function view(pdfUri: vscode.Uri, mode?: 'tab' | 'browser' | 'external'): Promise<void> {
    if (mode && mode !== 'tab') {
        logger.log(`Viewer mode "${mode}" maps to the internal tab preview in this build.`)
    }
    const configuration = vscode.workspace.getConfiguration('latex-workshop')
    const tabEditorGroup = configuration.get('view.pdf.tab.editorGroup', 'right') as string
    await openPdfInTab(pdfUri, tabEditorGroup, false)
}

async function viewInWebviewPanel(pdfUri: vscode.Uri, tabEditorGroup: string, preserveFocus: boolean): Promise<void> {
    await openPdfInTab(pdfUri, tabEditorGroup, preserveFocus)
}

/**
 * Handles the request from the internal PDF viewer.
 *
 * @param websocket The WebSocket connecting with the viewer.
 * @param msg A message from the viewer in JSON fromat.
 */
function handler(websocket: ws, msg: string): void {
    void websocket
    void msg
    logger.log('Ignoring viewer websocket message because the tab viewer uses postMessage transport.')
}

function getParams(): PdfViewerParams {
    const configuration = vscode.workspace.getConfiguration('latex-workshop')
    const invertType = configuration.get('view.pdf.invertMode.enabled') as string
    const invertEnabled =
        (invertType === 'auto' && vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark) ||
        invertType === 'always' ||
        (invertType === 'compat' && (configuration.get('view.pdf.invert') as number) > 0)
    const pack: PdfViewerParams = {
        toolbar: configuration.get('view.pdf.toolbar.hide.timeout') as number,
        sidebar: {
            open: configuration.get('view.pdf.sidebar.open') as 'off' | 'on' | 'persist',
            view: configuration.get('view.pdf.sidebar.view') as 'thumbnails' | 'outline' | 'attachments' | 'layers' | 'persist',
        },
        scale: configuration.get('view.pdf.zoom') as string,
        trim: configuration.get('view.pdf.trim') as number,
        scrollMode: configuration.get('view.pdf.scrollMode') as number,
        spreadMode: configuration.get('view.pdf.spreadMode') as number,
        hand: configuration.get('view.pdf.hand') as boolean,
        invertMode: {
            enabled: invertEnabled,
            brightness: configuration.get('view.pdf.invertMode.brightness') as number,
            grayscale: configuration.get('view.pdf.invertMode.grayscale') as number,
            hueRotate: configuration.get('view.pdf.invertMode.hueRotate') as number,
            invert: configuration.get('view.pdf.invert') as number,
            sepia: configuration.get('view.pdf.invertMode.sepia') as number,
        },
        color: {
            light: {
                pageColorsForeground: configuration.get('view.pdf.color.light.pageColorsForeground') || '',
                pageColorsBackground: configuration.get('view.pdf.color.light.pageColorsBackground') || '',
                backgroundColor: configuration.get('view.pdf.color.light.backgroundColor', '#ffffff'),
                pageBorderColor: configuration.get('view.pdf.color.light.pageBorderColor', 'lightgrey'),
            },
            dark: {
                pageColorsForeground: configuration.get('view.pdf.color.dark.pageColorsForeground') || '',
                pageColorsBackground: configuration.get('view.pdf.color.dark.pageColorsBackground') || '',
                backgroundColor: configuration.get('view.pdf.color.dark.backgroundColor', '#ffffff'),
                pageBorderColor: configuration.get('view.pdf.color.dark.pageBorderColor', 'lightgrey'),
            },
        },
        codeColorTheme: vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Light ? 'light' : 'dark',
        keybindings: {
            synctex: configuration.get('view.pdf.internal.synctex.keybinding') as 'ctrl-click' | 'double-click',
        },
        reloadTransition: configuration.get('view.pdf.reload.transition') as 'none' | 'fade',
    }
    return pack
}

/**
 * Reveals the position of `record` on the internal PDF viewers.
 *
 * @param pdfUri The path of a PDF file.
 * @param record The position to be revealed.
 */
function locate(pdfUri: vscode.Uri, record: SyncTeXRecordToPDF | SyncTeXRecordToPDFAll[]): Promise<void> {
    void pdfUri
    void record
    logger.log('Ignoring SyncTeX locate request because reverse SyncTeX is not wired for the tab viewer.')
    return Promise.resolve()
}

/**
 * !! Test only
 * Returns the state of the internal PDF viewer of `pdfFilePath`.
 *
 * @param pdfUri The path of a PDF file.
 */
function getViewerState(pdfUri: vscode.Uri): (PdfViewerState | undefined)[] {
    return getCustomEditorStates(pdfUri)
}

async function openPdfInTab(pdfUri: vscode.Uri, tabEditorGroup: string, preserveFocus: boolean): Promise<void> {
    const viewColumn = resolveViewColumn(tabEditorGroup)
    logger.log(`Open PDF in internal tab viewer for ${pdfUri.toString(true)}`)
    await vscode.commands.executeCommand('vscode.openWith', pdfUri, securePdfCustomEditorViewType, {
        preview: false,
        preserveFocus,
        viewColumn
    })
}

function resolveViewColumn(tabEditorGroup: string): vscode.ViewColumn {
    if (tabEditorGroup === 'current') {
        return vscode.ViewColumn.Active
    }
    return vscode.ViewColumn.Beside
}
