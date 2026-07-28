import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'

import { getProjectFilePaths } from '../core/project-insight'
import { lw } from '../lw'

type LabelMatch = {
    end: number,
    start: number,
    value: string
}

const LABEL_COMMAND = /\\(?:label|ref|eqref|autoref|pageref|cref|Cref|vref|Vref)\s*\{([^}]+)\}/g

export class LabelRenameProvider implements vscode.RenameProvider {
    prepareRename(document: vscode.TextDocument, position: vscode.Position): vscode.Range | { range: vscode.Range, placeholder: string } | undefined {
        const match = findLabelAtOffset(document.getText(), document.offsetAt(position))
        if (!match) {
            return
        }
        return {
            placeholder: match.value,
            range: new vscode.Range(document.positionAt(match.start), document.positionAt(match.end))
        }
    }

    async provideRenameEdits(document: vscode.TextDocument, position: vscode.Position, newName: string): Promise<vscode.WorkspaceEdit | undefined> {
        const match = findLabelAtOffset(document.getText(), document.offsetAt(position))
        if (!match) {
            return
        }
        if (!isValidLabel(newName)) {
            throw new Error('LaTeX labels cannot contain whitespace, braces, or commas.')
        }
        const rootFile = lw.root.file.path ?? await lw.root.resolveSecurityRoot()
        if (!rootFile || !await isDocumentInRootWorkspace(document, rootFile)) {
            throw new Error('LaTeX label rename is limited to files inside the current project workspace.')
        }
        const workspace = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(rootFile))!
        const workspacePath = await fs.promises.realpath(workspace.uri.fsPath)
        const projectFiles = await getProjectFilePaths(rootFile)
        if (!projectFiles.some(filePath => normalizePath(filePath) === normalizePath(document.fileName))) {
            projectFiles.push(document.fileName)
        }

        const edit = new vscode.WorkspaceEdit()
        for (const filePath of [...new Set(projectFiles)]) {
            if (!await isPathInsideWorkspace(filePath, workspacePath)) {
                continue
            }
            const targetDocument = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath))
            for (const replacement of collectLabelMatches(targetDocument.getText(), match.value)) {
                edit.replace(
                    targetDocument.uri,
                    new vscode.Range(
                        targetDocument.positionAt(replacement.start),
                        targetDocument.positionAt(replacement.end)
                    ),
                    newName
                )
            }
        }
        return edit
    }
}

function findLabelAtOffset(content: string, offset: number): LabelMatch | undefined {
    return collectCommandArgumentMatches(content).find(match => offset >= match.start && offset <= match.end)
}

function collectLabelMatches(content: string, label: string): LabelMatch[] {
    return collectCommandArgumentMatches(content).filter(match => match.value === label)
}

function collectCommandArgumentMatches(content: string): LabelMatch[] {
    const matches: LabelMatch[] = []
    LABEL_COMMAND.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = LABEL_COMMAND.exec(content)) !== null) {
        const group = match[1]
        const groupStart = match.index + match[0].indexOf(group)
        let searchFrom = 0
        for (const segment of group.split(',')) {
            const value = segment.trim()
            if (!value) {
                searchFrom += segment.length + 1
                continue
            }
            const startInGroup = group.indexOf(value, searchFrom)
            const start = groupStart + startInGroup
            const end = start + value.length
            matches.push({ end, start, value })
            searchFrom = startInGroup + value.length + 1
        }
    }
    return matches
}

async function isDocumentInRootWorkspace(document: vscode.TextDocument, rootFile: string): Promise<boolean> {
    if (document.uri.scheme !== 'file') {
        return false
    }
    const workspace = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(rootFile))
    const documentWorkspace = vscode.workspace.getWorkspaceFolder(document.uri)
    if (!workspace || workspace.uri.scheme !== 'file' || documentWorkspace?.uri.toString() !== workspace.uri.toString()) {
        return false
    }
    try {
        return await isPathInsideWorkspace(document.fileName, await fs.promises.realpath(workspace.uri.fsPath))
    } catch {
        return false
    }
}

async function isPathInsideWorkspace(filePath: string, workspacePath: string): Promise<boolean> {
    try {
        const candidate = await fs.promises.realpath(filePath)
        const relative = path.relative(workspacePath, candidate)
        return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
    } catch {
        return false
    }
}

function normalizePath(filePath: string): string {
    const normalized = path.resolve(filePath)
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function isValidLabel(value: string): boolean {
    return value.length > 0 && !/[\s{},]/.test(value)
}

export const labelRenameComponents = {
    collectLabelMatches,
    findLabelAtOffset,
    isValidLabel
}
