import * as vscode from 'vscode'
import { readFileSync } from 'fs'
import * as path from 'path'
import { lw } from '../lw'

export {
    state,
    render,
    provider
}

type SnippetViewResult = RenderResult | {
    type: 'insertSnippet',
    snippet: string
}

type RenderResult = {
    type: 'png',
    uri: string,
    data: string | undefined
}

async function render(pdfFileUri: vscode.Uri, opts: { height: number, width: number, pageNumber: number }): Promise<string | undefined> {
    if (!state.view?.webview) {
        return
    }
    const uri = state.view.webview.asWebviewUri(pdfFileUri).toString()
    const promise = new Promise<RenderResult | undefined>((resolve) => {
        const rendered = (e: SnippetViewResult) => {
            if (e.type !== 'png') {
                return
            }
            if (e.uri === uri) {
                resolve(e)
            }
        }
        state.callbacks.add(rendered)
        setTimeout(() => {
            state.callbacks.delete(rendered)
            resolve(undefined)
        }, 3000)
        void state.view?.webview.postMessage({
            type: 'pdf',
            uri,
            opts
        })
    })
    try {
        const renderResult = await promise
        return renderResult?.data
    } catch (_) { }
    return
}

function receive(message: SnippetViewResult) {
    if (message.type === 'insertSnippet') {
        vscode.window.activeTextEditor?.insertSnippet(
            new vscode.SnippetString(message.snippet.replace(/\\\n/g, '\\n')))
                .then(() => {}, err => {
                    void vscode.window.showWarningMessage(`Unable to insert symbol, ${err}`)
                }
        )
    }
}

class SnippetViewProvider implements vscode.WebviewViewProvider {
    public async resolveWebviewView(webviewView: vscode.WebviewView) {
        state.view = webviewView

        const resourcesUri = vscode.Uri.joinPath(lw.file.toUri(lw.extensionRoot), 'resources', 'snippetview')
        const pdfjsRootUri = vscode.Uri.joinPath(lw.file.toUri(lw.extensionRoot), 'node_modules', 'pdfjs-dist')
        const viewerBuildUri = vscode.Uri.joinPath(pdfjsRootUri, 'build')
        const viewerCmapsUri = vscode.Uri.joinPath(pdfjsRootUri, 'cmaps')

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [resourcesUri, viewerBuildUri, viewerCmapsUri]
        }

        webviewView.onDidDispose(() => {
            state.view = undefined
        })

        const webviewSourcePath = path.join(lw.extensionRoot, 'resources', 'snippetview', 'snippetview.html')
        const resourceRoot = webviewView.webview.asWebviewUri(resourcesUri).toString()
        const viewerBuildRoot = webviewView.webview.asWebviewUri(viewerBuildUri).toString()
        const viewerCmapsRoot = webviewView.webview.asWebviewUri(viewerCmapsUri).toString()

        const htmlContent = readFileSync(webviewSourcePath, { encoding: 'utf8' })
            .replaceAll('%RESOURCE_ROOT%', resourceRoot)
            .replaceAll('%PDFJS_ROOT%', viewerBuildRoot)
            .replaceAll('%PDF_WORKER%', `${viewerBuildRoot}/pdf.worker.mjs`)
            .replaceAll('%PDF_CMAPS%', viewerCmapsRoot)
            .replaceAll('%CSP%', webviewView.webview.cspSource)
        const replacements = await Promise.all(Array.from(htmlContent.matchAll(/\{%(.*?)%\}/g), match => lw.language.getLocaleString(match[1])))
        let index = 0
        webviewView.webview.html = htmlContent.replace(/\{%(.*?)%\}/g, () => replacements[index++])

        webviewView.webview.onDidReceiveMessage((e: SnippetViewResult) => {
            state.callbacks.forEach((cb) => void cb(e))
            receive(e)
        })
    }
}

const provider = new SnippetViewProvider()
const state = {
    view: undefined as vscode.WebviewView | undefined,
    callbacks: new Set<(e: SnippetViewResult) => void>()
}
