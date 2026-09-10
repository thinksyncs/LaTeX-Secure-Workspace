import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

import { lw } from '../lw'
import { maskCommentsAndVerbatim } from '../utils/utils'
import {
    buildImageResolution,
    collectGraphicspathDirs
} from '../lint/graphics-diagnostics-utils'

type PathKind = 'bib' | 'image' | 'tex'

type PathReference = {
    end: number,
    kind: PathKind,
    start: number,
    value: string
}

const PATH_COMMAND = /\\(input|include|subfile|subfileinclude|markdownInput|loadglsentries|includegraphics|bibliography|addbibresource)\*?(?:\s*\[[^\]]*\])?\s*\{([^}]+)\}/g
const SEARCH_PATTERNS: Record<PathKind, string> = {
    bib: '**/*.bib',
    image: '**/*.{pdf,png,jpg,jpeg,svg,eps}',
    tex: '**/*.{tex,ltx,rnw,Rnw}'
}

export class PathQuickFixProvider implements vscode.CodeActionProvider {
    async provideCodeActions(document: vscode.TextDocument, range: vscode.Range): Promise<vscode.CodeAction[]> {
        if (document.uri.scheme !== 'file') {
            return []
        }
        const workspace = vscode.workspace.getWorkspaceFolder(document.uri)
        if (!workspace || workspace.uri.scheme !== 'file') {
            return []
        }
        const startOffset = document.offsetAt(range.start)
        const endOffset = document.offsetAt(range.end)
        const reference = findPathReferences(document.getText()).find(candidate =>
            candidate.start <= endOffset && candidate.end >= startOffset
        )
        if (!reference || !isStaticProjectPath(reference.value)) {
            return []
        }

        const workspacePath = await realpathOrResolve(workspace.uri.fsPath)
        const rootFile = lw.root.file.path
        const rootWorkspace = rootFile ? vscode.workspace.getWorkspaceFolder(vscode.Uri.file(rootFile)) : undefined
        const rootDir = rootWorkspace?.uri.toString() === workspace.uri.toString()
            ? path.dirname(rootFile!)
            : path.dirname(document.fileName)
        if (await referenceExists(reference, document, rootDir, workspacePath)) {
            return []
        }

        const candidates = await findReplacementCandidates(reference, document.fileName, workspace, workspacePath)
        return candidates.slice(0, 8).map((candidate, _index, allCandidates) => {
            const replacement = candidateReplacement(reference, candidate, rootDir)
            const action = new vscode.CodeAction(`Replace missing path with ${replacement}`, vscode.CodeActionKind.QuickFix)
            action.edit = new vscode.WorkspaceEdit()
            action.edit.replace(
                document.uri,
                new vscode.Range(document.positionAt(reference.start), document.positionAt(reference.end)),
                replacement
            )
            action.isPreferred = allCandidates.length === 1
            return action
        })
    }
}

function findPathReferences(content: string): PathReference[] {
    content = maskCommentsAndVerbatim(content)
    const references: PathReference[] = []
    PATH_COMMAND.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = PATH_COMMAND.exec(content)) !== null) {
        const value = match[2].trim()
        const start = match.index + match[0].length - match[2].length - 1 + match[2].indexOf(value)
        if (!value) {
            continue
        }
        references.push({
            end: start + value.length,
            kind: commandKind(match[1]),
            start,
            value
        })
    }
    return references
}

function commandKind(command: string): PathKind {
    if (command === 'includegraphics') {
        return 'image'
    }
    if (command === 'bibliography' || command === 'addbibresource') {
        return 'bib'
    }
    return 'tex'
}

async function referenceExists(reference: PathReference, document: vscode.TextDocument, rootDir: string, workspacePath: string): Promise<boolean> {
    let candidates: string[]
    if (reference.kind === 'image') {
        candidates = buildImageResolution(
            reference.value,
            rootDir,
            rootDir,
            collectGraphicspathDirs(document.getText())
        ).candidates
    } else {
        const extension = reference.kind === 'bib' ? '.bib' : '.tex'
        const values = path.extname(reference.value) ? [reference.value] : [reference.value, `${reference.value}${extension}`]
        candidates = values.map(value => path.resolve(rootDir, value))
    }
    for (const candidate of candidates) {
        if (await isExistingWorkspaceFile(candidate, workspacePath)) {
            return true
        }
    }
    return false
}

async function findReplacementCandidates(reference: PathReference, documentFile: string, workspace: vscode.WorkspaceFolder, workspacePath: string): Promise<string[]> {
    const uris = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspace, SEARCH_PATTERNS[reference.kind]),
        '**/{.git,node_modules,.lw-security}/**',
        2000
    )
    const expectedName = path.basename(reference.value)
    const expectedExtension = path.extname(expectedName)
    const candidates: string[] = []
    for (const uri of uris) {
        if (normalizePath(uri.fsPath) === normalizePath(documentFile)) {
            continue
        }
        const candidateName = path.basename(uri.fsPath)
        const nameMatches = expectedExtension
            ? candidateName.toLowerCase() === expectedName.toLowerCase()
            : path.basename(candidateName, path.extname(candidateName)).toLowerCase() === expectedName.toLowerCase()
        if (nameMatches && await isExistingWorkspaceFile(uri.fsPath, workspacePath)) {
            candidates.push(uri.fsPath)
        }
    }
    return candidates.sort((left, right) => left.localeCompare(right))
}

function normalizePath(filePath: string): string {
    const normalized = path.resolve(filePath)
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function candidateReplacement(reference: PathReference, candidate: string, rootDir: string): string {
    let relative = path.relative(rootDir, candidate).split(path.sep).join('/')
    if (!path.extname(reference.value)) {
        relative = relative.slice(0, -path.extname(relative).length)
    }
    return relative
}

function isStaticProjectPath(value: string): boolean {
    return value.length > 0
        && !path.isAbsolute(value)
        && !value.includes('\\')
        && !value.includes('{')
        && !value.includes('}')
        && !value.includes('#')
        && !value.includes(',')
}

async function isExistingWorkspaceFile(filePath: string, workspacePath: string): Promise<boolean> {
    try {
        const candidate = await fs.promises.realpath(filePath)
        const relative = path.relative(workspacePath, candidate)
        if (relative !== '' && (path.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${path.sep}`))) {
            return false
        }
        return (await fs.promises.stat(candidate)).isFile()
    } catch {
        return false
    }
}

async function realpathOrResolve(filePath: string): Promise<string> {
    try {
        return await fs.promises.realpath(filePath)
    } catch {
        return path.resolve(filePath)
    }
}

export const pathQuickFixComponents = {
    candidateReplacement,
    findPathReferences,
    isStaticProjectPath
}
