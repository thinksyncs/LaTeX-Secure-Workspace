import * as path from 'path'
import * as vscode from 'vscode'
import { lw } from '../lw'

const diagnostics = vscode.languages.createDiagnosticCollection('LaTeX Graphics')
const supportedImageExtensions = ['.pdf', '.png', '.jpg', '.jpeg']
const knownButUnsupportedExtensions = ['.eps', '.svg', '.gif', '.tif', '.tiff', '.webp']
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
    const rootFile = lw.root.file.path || await lw.root.resolveSecurityRoot()
    const rootDir = rootFile ? path.dirname(rootFile) : undefined
    const documentDir = path.dirname(document.uri.fsPath)
    const result: vscode.Diagnostic[] = []
    const text = document.getText()
    const pattern = /\\includegraphics\s*(?:\[[^\]]*\]\s*)?(?:\[[^\]]*\]\s*)?\{([^}]+)\}/g
    let match: RegExpExecArray | null

    while ((match = pattern.exec(text)) !== null) {
        const imagePath = match[1]?.trim()
        if (!imagePath || shouldSkipImagePath(imagePath) || isCommentedOut(text, match.index)) {
            continue
        }
        const range = new vscode.Range(
            document.positionAt(match.index + match[0].indexOf(imagePath)),
            document.positionAt(match.index + match[0].indexOf(imagePath) + imagePath.length)
        )
        const resolved = await resolveImagePath(imagePath, documentDir, rootDir)
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

function shouldSkipImagePath(imagePath: string): boolean {
    return imagePath.includes('\\') || imagePath.includes('{') || imagePath.includes('}')
}

function isCommentedOut(text: string, offset: number): boolean {
    const lineStart = text.lastIndexOf('\n', offset) + 1
    const prefix = text.slice(lineStart, offset)
    return /^\s*%/.test(prefix)
}

async function resolveImagePath(imagePath: string, documentDir: string, rootDir: string | undefined): Promise<{ exists: boolean, unsupportedExtension?: string }> {
    const baseDirs = [...new Set([documentDir, rootDir].filter((dir): dir is string => Boolean(dir)))]
    const parsedExt = path.extname(imagePath).toLowerCase()
    const candidatePaths = parsedExt
        ? baseDirs.map(dir => path.resolve(dir, imagePath))
        : baseDirs.flatMap(dir => supportedImageExtensions.map(ext => path.resolve(dir, `${imagePath}${ext}`)))

    for (const candidate of candidatePaths) {
        if (await fileExists(candidate)) {
            return {
                exists: true,
                unsupportedExtension: unsupportedExtension(candidate)
            }
        }
    }

    if (!parsedExt) {
        for (const dir of baseDirs) {
            for (const ext of knownButUnsupportedExtensions) {
                const candidate = path.resolve(dir, `${imagePath}${ext}`)
                if (await fileExists(candidate)) {
                    return {
                        exists: true,
                        unsupportedExtension: ext
                    }
                }
            }
        }
    }

    return { exists: false, unsupportedExtension: parsedExt && knownButUnsupportedExtensions.includes(parsedExt) ? parsedExt : undefined }
}

function unsupportedExtension(filePath: string): string | undefined {
    const ext = path.extname(filePath).toLowerCase()
    return knownButUnsupportedExtensions.includes(ext) ? ext : undefined
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        const stat = await vscode.workspace.fs.stat(vscode.Uri.file(filePath))
        return stat.type === vscode.FileType.File || stat.type === (vscode.FileType.File | vscode.FileType.SymbolicLink)
    } catch {
        return false
    }
}
