import * as path from 'path'
import * as vscode from 'vscode'
import { lw } from '../lw'
import {
    buildImageResolution,
    buildUnsupportedExtensionCandidates,
    collectGraphicspathDirs,
    collectIncludeGraphics,
    isUnsupportedImageExtension
} from './graphics-diagnostics-utils'

const diagnostics = vscode.languages.createDiagnosticCollection('LaTeX Graphics')
const pendingUpdates = new Map<string, NodeJS.Timeout>()

export const graphicsDiagnostics = {
    initialize,
    update,
    dispose
}

function initialize(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        diagnostics,
        vscode.workspace.onDidOpenTextDocument(document => {
            void update(document)
        }),
        vscode.workspace.onDidSaveTextDocument(document => {
            void update(document)
        }),
        vscode.workspace.onDidChangeTextDocument(event => {
            queueUpdate(event.document)
        })
    )
    vscode.workspace.textDocuments.forEach(document => {
        void update(document)
    })
}

function dispose(): void {
    for (const timer of pendingUpdates.values()) {
        clearTimeout(timer)
    }
    pendingUpdates.clear()
    diagnostics.dispose()
}

function queueUpdate(document: vscode.TextDocument): void {
    const key = document.uri.toString(true)
    const previous = pendingUpdates.get(key)
    if (previous) {
        clearTimeout(previous)
    }
    pendingUpdates.set(key, setTimeout(() => {
        pendingUpdates.delete(key)
        void update(document)
    }, 250))
}

async function update(document: vscode.TextDocument): Promise<void> {
    if (!shouldScan(document)) {
        diagnostics.delete(document.uri)
        return
    }
    diagnostics.set(document.uri, await collectDiagnostics(document))
}

function shouldScan(document: vscode.TextDocument): boolean {
    return document.uri.scheme === 'file' && (
        lw.file.hasLaTeXLangId(document.languageId)
        || lw.file.hasLaTeXClassPackageLangId(document.languageId)
        || lw.file.hasDtxLangId(document.languageId)
    )
}

async function collectDiagnostics(document: vscode.TextDocument): Promise<vscode.Diagnostic[]> {
    const rootFile = lw.root.file.path
    const rootDir = rootFile ? path.dirname(rootFile) : undefined
    const documentDir = path.dirname(document.uri.fsPath)
    const result: vscode.Diagnostic[] = []
    const text = document.getText()
    const graphicsPathDirs = collectGraphicspathDirs(text)

    for (const include of collectIncludeGraphics(text)) {
        const imagePath = include.imagePath
        const range = new vscode.Range(
            document.positionAt(include.index),
            document.positionAt(include.index + include.length)
        )
        const resolved = await resolveImagePath(imagePath, documentDir, rootDir, graphicsPathDirs)
        if (!resolved.exists) {
            const diagnostic = new vscode.Diagnostic(
                range,
                `Image file not found for \\includegraphics: ${imagePath}`,
                vscode.DiagnosticSeverity.Warning
            )
            diagnostic.source = diagnostics.name
            result.push(diagnostic)
            continue
        }
        if (resolved.unsupportedExtension) {
            const diagnostic = new vscode.Diagnostic(
                range,
                `Image extension ${resolved.unsupportedExtension} may not work with the secure PDF latexmk build. Prefer PDF, PNG, JPG, or JPEG.`,
                vscode.DiagnosticSeverity.Information
            )
            diagnostic.source = diagnostics.name
            result.push(diagnostic)
        }
    }

    return result
}

async function resolveImagePath(imagePath: string, documentDir: string, rootDir: string | undefined, graphicsPathDirs: string[]): Promise<{ exists: boolean, unsupportedExtension?: string }> {
    const resolution = buildImageResolution(imagePath, documentDir, rootDir, graphicsPathDirs)
    for (const candidate of resolution.candidates) {
        if (await fileExists(candidate)) {
            return {
                exists: true,
                unsupportedExtension: isUnsupportedImageExtension(candidate) ? path.extname(candidate).toLowerCase() : undefined
            }
        }
    }

    for (const candidate of buildUnsupportedExtensionCandidates(imagePath, documentDir, rootDir, graphicsPathDirs)) {
        if (await fileExists(candidate)) {
            return {
                exists: true,
                unsupportedExtension: path.extname(candidate).toLowerCase()
            }
        }
    }

    return { exists: false, unsupportedExtension: resolution.unsupportedExtension }
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath))
        return stat.type === vscode.FileType.File || stat.type === (vscode.FileType.File | vscode.FileType.SymbolicLink)
    } catch {
        return false
    }
}
