import * as vscode from 'vscode'
import * as path from 'path'
import { lw } from '../../lw'
import * as manager from './pdfviewermanager'
import type { PdfViewerState } from '../../../types/latex-workshop-protocol-types/index'
import { escapeHtml } from '../../utils/utils'

const logger = lw.log('Viewer', 'Panel')

export {
    type PdfViewerPanel,
    configurePdfViewerWebview,
    getPdfViewerHostHtml,
    serializer,
    populate
}

class PdfViewerPanel {
    readonly webviewPanel: vscode.WebviewPanel
    readonly pdfUri: vscode.Uri
    private readonly viewerState: PdfViewerState | undefined
    private viewerReady = false
    private readonly startupTimeout: NodeJS.Timeout
    private attemptedInlineFallback = false
    private inlineFallbackLoaded = false
    private inlineFallbackTimer: NodeJS.Timeout | undefined

    constructor(pdfFileUri: vscode.Uri, panel: vscode.WebviewPanel) {
        this.pdfUri = pdfFileUri
        this.webviewPanel = panel
        this.viewerState = {
            path: pdfFileUri.fsPath,
            pdfFileUri: pdfFileUri.toString(true)
        }
        this.startupTimeout = setTimeout(() => {
            if (this.viewerReady) {
                return
            }
            logger.log('Internal PDF viewer did not initialize in time. Falling back to lightweight in-tab PDF embed.')
            void vscode.window.showWarningMessage('Internal PDF.js viewer failed to initialize. Switching to lightweight PDF tab mode.')
            this.showInlinePdfFallback()
        }, 2500)
        panel.webview.onDidReceiveMessage((message: { type?: string }) => {
            if (message.type === 'viewer-loaded' && this.viewerState) {
                this.viewerReady = true
                clearTimeout(this.startupTimeout)
                lw.event.fire(lw.event.ViewerPageLoaded)
                lw.event.fire(lw.event.ViewerStatusChanged, this.viewerState)
                return
            }
            if (message.type === 'viewer-inline-loaded') {
                this.inlineFallbackLoaded = true
                if (this.inlineFallbackTimer) {
                    clearTimeout(this.inlineFallbackTimer)
                    this.inlineFallbackTimer = undefined
                }
                return
            }
            if (message.type === 'viewer-log' && typeof (message as { message?: unknown }).message === 'string') {
                logger.log((message as { message: string }).message)
            }
        })
        panel.onDidDispose(() => {
            clearTimeout(this.startupTimeout)
            if (this.inlineFallbackTimer) {
                clearTimeout(this.inlineFallbackTimer)
                this.inlineFallbackTimer = undefined
            }
        })
    }

        private showInlinePdfFallback() {
                if (this.attemptedInlineFallback) {
                        return
                }
                this.attemptedInlineFallback = true
                const webview = this.webviewPanel.webview
                const nonce = getNonce()
                const cspSource = webview.cspSource
                const pdfUri = webview.asWebviewUri(this.pdfUri).toString()
                this.viewerReady = true
                webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; object-src ${cspSource} data: blob:; frame-src ${cspSource} data: blob:; img-src ${cspSource} data: blob:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
    <style>
      html,body{height:100%;width:100%;margin:0;padding:0;background:#1e1e1e;color:#ddd;font:13px sans-serif;}
      #wrap{height:100%;width:100%;display:flex;align-items:stretch;justify-content:stretch;}
      object,embed,iframe{height:100%;width:100%;border:0;display:block;}
      #fallback{padding:16px;}
    </style>
</head>
<body>
    <div id="wrap">
      <object id="lw-inline-pdf" data="${pdfUri}" type="application/pdf">
        <embed src="${pdfUri}" type="application/pdf" />
        <iframe src="${pdfUri}" title="PDF"></iframe>
        <div id="fallback">PDF preview could not be rendered in this tab.</div>
      </object>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const pdfObject = document.getElementById('lw-inline-pdf');
        pdfObject.addEventListener('load', () => {
            vscode.postMessage({ type: 'viewer-inline-loaded' });
            vscode.postMessage({ type: 'viewer-loaded' });
        });
        pdfObject.addEventListener('error', () => {
            vscode.postMessage({ type: 'viewer-log', message: '[viewer-inline] object error' });
        });
    </script>
</body>
</html>`
                this.inlineFallbackLoaded = false
                this.inlineFallbackTimer = setTimeout(() => {
                        if (this.inlineFallbackLoaded) {
                                return
                        }
                        logger.log('Lightweight in-tab PDF embed did not load in time. Opening system PDF viewer as final fallback.')
                        void vscode.window.showWarningMessage('In-tab PDF embed did not load. Opening the PDF in the system viewer.')
                        void vscode.env.openExternal(this.pdfUri)
                }, 1800)
        }

    get state() {
        return this.viewerState
    }

}

class PdfViewerPanelSerializer implements vscode.WebviewPanelSerializer {
    async deserializeWebviewPanel(panel: vscode.WebviewPanel, argState: {state: PdfViewerState}): Promise<void> {
        logger.log(`Restoring at column ${panel.viewColumn} with state ${JSON.stringify(argState.state)}.`)
        const state = argState.state
        let pdfFileUri: vscode.Uri | undefined
        if (state.path) {
            pdfFileUri = lw.file.toUri(state.path)
        } else if (state.pdfFileUri) {
            pdfFileUri = vscode.Uri.parse(state.pdfFileUri, true)
        }
        if (!pdfFileUri) {
            logger.log('Failed restoring viewer with undefined PDF path.')
            panel.webview.html = '<!DOCTYPE html> <html lang="en"><meta charset="utf-8"/><br>The path of PDF file is undefined.</html>'
            return
        }
        if (! await lw.file.exists(pdfFileUri)) {
            const s = escapeHtml(pdfFileUri.toString())
            logger.log(`Failed restoring viewer with non-existent PDF ${pdfFileUri.toString(true)} .`)
            panel.webview.html = `<!DOCTYPE html> <html lang="en"><meta charset="utf-8"/><br>File not found: ${s}</html>`
            return
        }
        configureWebview(panel, pdfFileUri)
        panel.webview.html = getPdfViewerHostHtml(pdfFileUri, panel.webview)
        const pdfPanel = new PdfViewerPanel(pdfFileUri, panel)
        manager.insert(pdfPanel)
        return
    }
}

const serializer = new PdfViewerPanelSerializer()

function configureWebview(panel: vscode.WebviewPanel, pdfUri: vscode.Uri) {
    configurePdfViewerWebview(panel.webview, pdfUri)
}

function configurePdfViewerWebview(webview: vscode.Webview, pdfUri: vscode.Uri) {
    const extensionRoot = lw.file.toUri(lw.extensionRoot)
    const viewerRoot = vscode.Uri.joinPath(extensionRoot, 'viewer')
    const pdfRoot = pdfUri.with({ path: path.posix.dirname(pdfUri.path) })
    webview.options = {
        enableScripts: true,
        localResourceRoots: [extensionRoot, viewerRoot, pdfRoot]
    }
}

// Create a PdfViewerPanel inside an existing vscode.WebviewPanel
function populate(pdfUri: vscode.Uri, panel: vscode.WebviewPanel): PdfViewerPanel {
    configureWebview(panel, pdfUri)
    const htmlContent = getPdfViewerHostHtml(pdfUri, panel.webview)
    panel.webview.html = htmlContent
    const pdfPanel = new PdfViewerPanel(pdfUri, panel)
    return pdfPanel
}

/**
 * Returns the HTML content of the internal PDF viewer.
 *
 * @param pdfUri The path of a PDF file to be opened.
 */
function getPdfViewerHostHtml(pdfUri: vscode.Uri, webview: vscode.Webview): string {
    const nonce = getNonce()
    const viewerRoot = vscode.Uri.joinPath(lw.file.toUri(lw.extensionRoot), 'viewer')
    const viewerHtmlUri = vscode.Uri.joinPath(viewerRoot, 'viewer.html')
    const panelWebviewUri = webview.asWebviewUri(viewerHtmlUri).toString()
    const configuration = encodeURIComponent(encodeJsonConfig(lw.viewer.getParams()))
    const encodedPdfUri = encodeURIComponent(encodePdfPath(webview.asWebviewUri(pdfUri).toString()))
    const encodedTitle = encodeURIComponent(path.basename(pdfUri.fsPath) || 'Untitled PDF')
    const cspSource = webview.cspSource
    logger.log(`Internal PDF viewer at ${panelWebviewUri} .`)
    return `
    <!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; frame-src ${cspSource}; script-src 'nonce-${nonce}'; style-src 'unsafe-inline'; img-src ${cspSource} data: blob:;"></head>
    <body style="padding:0;margin:0;overflow:hidden;background:#1e1e1e;"><iframe id="preview-panel" class="preview-panel" src="${panelWebviewUri}?file=${encodedPdfUri}&config=${configuration}&title=${encodedTitle}" style="position:absolute; border: none; left: 0; top: 0; width: 100%; height: 100%;">
    </iframe>
    <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const iframe = document.getElementById('preview-panel');
    iframe.addEventListener('load', () => {
        vscode.postMessage({ type: 'viewer-log', message: '[viewer-host] iframe loaded' });
    });
    iframe.addEventListener('error', () => {
        vscode.postMessage({ type: 'viewer-log', message: '[viewer-host] iframe error' });
    });
    window.addEventListener('focus', () => {
        setTimeout(() => iframe.contentWindow?.focus(), 100);
    });
    window.addEventListener('message', event => {
        if (event.data?.type === 'loaded' || event.data?.type === 'initialized') {
            vscode.postMessage({ type: 'viewer-loaded' });
            return;
        }
        if (event.data?.type === 'state') {
            return;
        }
        if (event.data?.type === 'log' && typeof event.data.message === 'string') {
            vscode.postMessage({ type: 'viewer-log', message: event.data.message });
            return;
        }
        if (event.data?.type === 'reload-viewer') {
            iframe.src = iframe.src;
        }
    });
    </script>
    </body></html>
    `
}

function encodePdfPath(pdfUri: string): string {
    const text = encodeURIComponent(pdfUri)
    return Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function encodeJsonConfig(params: unknown): string {
    const text = encodeURIComponent(JSON.stringify(params))
    return Buffer.from(text, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function getNonce(): string {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
}
