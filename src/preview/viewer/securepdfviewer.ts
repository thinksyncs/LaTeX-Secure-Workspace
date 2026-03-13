import * as fs from 'fs/promises'
import * as path from 'path'
import * as vscode from 'vscode'

import type { PreviewDefaults, PreviewFeatures, PreviewWebviewSettings } from '../../../vendor/pdfviewer-secure/src/config'
import type { PdfViewerParams } from '../../../types/latex-workshop-protocol-types/index'
import { lw } from '../../lw'

export interface SecurePdfViewerWebviewSettings extends PreviewWebviewSettings {
    appearance: PdfViewerParams
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
    const viewerHtmlPath = path.join(lw.extensionRoot, 'viewer', 'lib', 'web', 'viewer.html')
    const webviewSettings = createWebviewSettings(pdfUri, webview, viewerRoot, params)
    const webviewRuntimeUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionRoot, 'out', 'vendor', 'pdfviewer-secure', 'webview', 'main.js')).toString()
    const pdfCssUri = webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'pdf.css')).toString()

    let html = await fs.readFile(viewerHtmlPath, 'utf8')
    html = html.replace(
        '<title>PDF.js viewer</title>',
        `<title>PDF.js viewer</title>
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; base-uri 'none'; object-src 'none'; connect-src ${webview.cspSource}; script-src ${webview.cspSource}; script-src-elem ${webview.cspSource}; script-src-attr 'none'; style-src ${webview.cspSource}; style-src-elem ${webview.cspSource}; style-src-attr 'unsafe-inline'; img-src blob: data: ${webview.cspSource}; font-src ${webview.cspSource}; worker-src blob: ${webview.cspSource};">
<meta id="pdf-preview-config" data-config="${escapeAttribute(JSON.stringify(webviewSettings))}">`
    )
    html = html.replace('href="locale/locale.json"', `href="${webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'web', 'locale', 'locale.json')).toString()}"`)
    html = html.replace('src="../build/pdf.mjs"', `src="${webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'build', 'pdf.mjs')).toString()}"`)
    html = html.replace('href="viewer.css"', `href="${webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'web', 'viewer.css')).toString()}"`)
    html = html.replace('src="viewer.mjs"', `src="${webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'web', 'viewer.mjs')).toString()}"`)
    html = html.replace(
        '</head>',
        `  <link rel="stylesheet" href="${pdfCssUri}" />
  <script src="${webviewRuntimeUri}"></script>
  </head>`
    )
    return html
}

function createWebviewSettings(pdfUri: vscode.Uri, webview: vscode.Webview, viewerRoot: vscode.Uri, params: PdfViewerParams): SecurePdfViewerWebviewSettings {
    const features: PreviewFeatures = {
        annotationEditing: false,
        currentView: false,
        documentProperties: false,
        download: false,
        externalLinks: false,
        forms: false,
        openFile: false,
        print: false,
    }
    const defaults: PreviewDefaults = {
        cursor: params.hand ? 'hand' : 'select',
        scale: params.scale,
        sidebar: params.sidebar.open === 'on',
        scrollMode: mapScrollMode(params.scrollMode),
        spreadMode: mapSpreadMode(params.spreadMode),
    }

    return {
        appearance: params,
        cMapUrl: `${webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'web', 'cmaps')).toString()}/`,
        defaults,
        features,
        iccUrl: `${webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'web', 'iccs')).toString()}/`,
        imageResourcesPath: `${webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'web', 'images')).toString()}/`,
        path: webview.asWebviewUri(pdfUri).toString(),
        runtime: {
            annotationEditorModeDisable: -1,
            annotationEditorModeNone: 0,
            annotationModeEnable: 1,
            annotationModeEnableForms: 2,
        },
        sandboxBundleSrc: webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'build', 'pdf.sandbox.mjs')).toString(),
        standardFontDataUrl: `${webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'web', 'standard_fonts')).toString()}/`,
        wasmUrl: `${webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'web', 'wasm')).toString()}/`,
        workerSrc: webview.asWebviewUri(vscode.Uri.joinPath(viewerRoot, 'build', 'pdf.worker.mjs')).toString(),
    }
}

function mapScrollMode(scrollMode: number): PreviewDefaults['scrollMode'] {
    switch (scrollMode) {
        case 1:
            return 'horizontal'
        case 2:
            return 'wrapped'
        default:
            return 'vertical'
    }
}

function mapSpreadMode(spreadMode: number): PreviewDefaults['spreadMode'] {
    switch (spreadMode) {
        case 1:
            return 'odd'
        case 2:
            return 'even'
        default:
            return 'none'
    }
}

function escapeAttribute(value: string): string {
    return value.replace(/"/g, '&quot;')
}
