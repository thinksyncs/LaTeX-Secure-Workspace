import * as fs from 'fs/promises'
import * as path from 'path'
import * as vscode from 'vscode'

import type { PdfViewerParams } from '../../../types/latex-workshop-protocol-types/index'
import { lw } from '../../lw'

interface MinimalPdfViewerDefaults {
    scale: string
}

interface MinimalPdfViewerAppearance {
    appearance: PdfViewerParams
}

interface SecurePdfViewerWebviewSettings extends MinimalPdfViewerAppearance {
    cMapUrl: string
    defaults: MinimalPdfViewerDefaults
    path: string
    standardFontDataUrl: string
    wasmUrl: string
    workerSrc: string
    pdfjsSrc: string
}

export function configureSecurePdfViewerWebview(webview: vscode.Webview, pdfUri: vscode.Uri): void {
    const extensionRoot = lw.file.toUri(lw.extensionRoot)
    const pdfRoot = vscode.Uri.file(path.dirname(pdfUri.fsPath))

    webview.options = {
        enableScripts: true,
        localResourceRoots: [extensionRoot, pdfRoot]
    }
}

export async function getSecurePdfViewerHtml(pdfUri: vscode.Uri, webview: vscode.Webview, params: PdfViewerParams): Promise<string> {
    const extensionRoot = lw.file.toUri(lw.extensionRoot)
    const viewerRoot = vscode.Uri.joinPath(extensionRoot, 'viewer', 'lib')
    const viewerHtmlPath = path.join(lw.extensionRoot, 'resources', 'pdfviewer', 'minimalviewer.html')
    const webviewSettings = createWebviewSettings(pdfUri, webview, viewerRoot, params)
    const viewerCssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionRoot, 'resources', 'pdfviewer', 'minimalviewer.css')).toString()
    const viewerScriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionRoot, 'resources', 'pdfviewer', 'minimalviewer.js')).toString()

    let html = await fs.readFile(viewerHtmlPath, 'utf8')
    html = html.replaceAll('%CSP_SOURCE%', webview.cspSource)
    html = html.replaceAll('%VIEWER_CSS%', viewerCssUri)
    html = html.replaceAll('%VIEWER_SCRIPT%', viewerScriptUri)
    html = html.replaceAll('%VIEWER_CONFIG%', escapeAttribute(JSON.stringify(webviewSettings)))
    return html
}

function createWebviewSettings(pdfUri: vscode.Uri, webview: vscode.Webview, viewerRoot: vscode.Uri, params: PdfViewerParams): SecurePdfViewerWebviewSettings {
    return {
        appearance: params,
        cMapUrl: `${webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'web', 'cmaps')).toString()}/`,
        defaults: {
            scale: params.scale,
        },
        path: webview.asWebviewUri(pdfUri).toString(),
        pdfjsSrc: webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'build', 'pdf.mjs')).toString(),
        standardFontDataUrl: `${webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'web', 'standard_fonts')).toString()}/`,
        wasmUrl: `${webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'web', 'wasm')).toString()}/`,
        workerSrc: webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'build', 'pdf.worker.mjs')).toString(),
    }
}

function escapeAttribute(value: string): string {
    return value.replace(/"/g, '&quot;')
}
