import * as fs from 'fs'
import * as path from 'path'
import * as vscode from 'vscode'
import { lw } from '../lw'
import { requireTrustedWorkspace } from '../utils/security'

export async function copyFirstPdfSample(folder: string, language: 'english' | 'japanese'): Promise<string> {
    const target = path.join(folder, `first-pdf-${language}.tex`)
    await fs.promises.copyFile(path.join(lw.extensionRoot, 'resources', `sample-${language}.tex`), target, fs.constants.COPYFILE_EXCL)
    return target
}

export async function createFirstPdfSample(): Promise<void> {
    if (!requireTrustedWorkspace('Create first-PDF sample') || vscode.env.remoteName
        || !vscode.workspace.workspaceFolders?.length
        || vscode.workspace.workspaceFolders.some(folder => folder.uri.scheme !== 'file')) {
        return
    }
    const selection = await vscode.window.showQuickPick([
        {label: 'English', description: 'Minimal pdfLaTeX document', language: 'english' as const},
        {label: '日本語', description: 'pdfLaTeX + CJK + IPAex fonts; use Japanese TeX or an approved equivalent', language: 'japanese' as const}
    ], {title: 'Create a first-PDF sample', placeHolder: 'Creates one new file. No download or build starts.'})
    if (!selection) { return }
    const folders = await vscode.window.showOpenDialog({
        title: 'Choose a folder inside the current workspace', openLabel: 'Create Sample Here',
        canSelectFiles: false, canSelectFolders: true, canSelectMany: false,
        defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri
    })
    const selected = folders?.[0]
    if (!selected || selected.scheme !== 'file' || !vscode.workspace.isTrusted || vscode.env.remoteName) { return }
    try {
        const folder = await fs.promises.realpath(selected.fsPath)
        const roots = await Promise.all((vscode.workspace.workspaceFolders ?? [])
            .filter(item => item.uri.scheme === 'file').map(item => fs.promises.realpath(item.uri.fsPath)))
        if (!roots.some(root => {
            const relative = path.relative(root, folder)
            return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep))
        })) {
            throw new Error('Choose a folder inside the current workspace; links outside it are not followed.')
        }
        if (!vscode.workspace.isTrusted) { return }
        const target = await copyFirstPdfSample(folder, selection.language)
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(target))
        const action = await vscode.window.showInformationMessage(
            `Sample created. Run Build LaTeX project when ready.${selection.language === 'japanese' ? ' This sample needs CJK and IPAex fonts (Japanese TeX profile); it does not use LuaLaTeX.' : ''}`,
            'Show Build Status'
        )
        if (action === 'Show Build Status') {
            await vscode.commands.executeCommand('latex-workshop.secure-build-status')
        }
    } catch (error) {
        const message = (error as NodeJS.ErrnoException).code === 'EEXIST'
            ? 'The sample filename already exists. It was not overwritten; choose another folder.'
            : error instanceof Error ? error.message : String(error)
        void vscode.window.showErrorMessage(`Could not create the sample: ${message}`)
    }
}
