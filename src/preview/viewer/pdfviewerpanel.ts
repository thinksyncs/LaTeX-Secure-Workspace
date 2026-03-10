import * as path from 'path'
import * as vscode from 'vscode'

import { lw } from '../../lw'

export function configurePdfViewerWebview(webview: vscode.Webview, pdfUri: vscode.Uri): void {
    const extensionRoot = lw.file.toUri(lw.extensionRoot)
    const pdfRoot = vscode.Uri.file(path.dirname(pdfUri.fsPath))

    webview.options = {
        enableScripts: true,
        localResourceRoots: [extensionRoot, pdfRoot]
    }
}
