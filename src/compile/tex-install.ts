import * as path from 'path'
import * as vscode from 'vscode'
import { lw } from '../lw'
import { getSecureConfigurationValueSync, requireTrustedWorkspace } from '../utils/security'
import { getCurrentTinyTexAsset, getManagedTexStorage, installManagedTex } from '../utils/managed-tex'
import { TINYTEX_VERSION, tinyTexDownloadUrl } from '../utils/tinytex-manifest'
import { JAPANESE_TEX_SOURCE, managedTexDirectory, type ManagedTexProfile } from '../utils/japanese-tex-manifest'

let pending: Promise<boolean> | undefined

function allowed(): boolean {
    return requireTrustedWorkspace('TeX installation') && !vscode.env.remoteName
        && Boolean(vscode.workspace.workspaceFolders?.length)
        && !vscode.workspace.workspaceFolders?.some(folder => folder.uri.scheme !== 'file')
}

export async function requestManagedTexInstall(): Promise<boolean> {
    if (pending) {
        return pending
    }
    pending = installWithConsent()
    try {
        return await pending
    } finally {
        pending = undefined
    }
}

async function installWithConsent(): Promise<boolean> {
    if (!allowed()) {
        void vscode.window.showInformationMessage('Automatic TeX installation requires a trusted local folder in a local VS Code window. Remote hosts are not modified; use the installation guide there.')
        return false
    }
    const asset = getCurrentTinyTexAsset()
    const storage = getManagedTexStorage()
    if (!asset || !storage) {
        void vscode.window.showErrorMessage('Automatic TeX installation is unavailable for this environment. Use the Installation Guide or your organization’s approved TeX installation.')
        return false
    }
    const selected = await vscode.window.showQuickPick([
        { label: 'Lightweight TeX', description: 'TinyTeX-1 · small standard pdfLaTeX installation', profile: 'lightweight' as const },
        { label: 'Japanese TeX — 日本語', description: 'TinyTeX-1 + CJK + IPAex Mincho/Gothic fonts (about 15 MiB extra)', profile: 'japanese' as const }
    ], { title: 'Choose your TeX installation', placeHolder: 'Existing system TeX is kept; only the selected copy is used for local builds.' })
    if (!selected || !allowed()) {
        return false
    }
    const profile: ManagedTexProfile = selected.profile
    const choice = await vscode.window.showInformationMessage(
        `Install ${selected.label} for this extension?`,
        {
            modal: true,
            detail: `Download TinyTeX-1 ${TINYTEX_VERSION} (about ${Math.ceil(asset.bytes / 1024 / 1024)} MiB; more space is needed after extraction) from:\n${tinyTexDownloadUrl(asset)}${profile === 'japanese' ? `\n\nJapanese support: CJK and IPAex Type1 Mincho/Gothic, including licenses (about 15 MiB), from the CTAN mirror (size and SHA-256 pinned):\n${JAPANESE_TEX_SOURCE}\nThis supports the supplied pdfLaTeX Japanese sample; LuaLaTeX still requires Docker.` : ''}\n\nInstall to:\n${path.join(storage, managedTexDirectory(profile))}\n\nAll downloads are checked against pinned SHA-256 values before extraction. Windows uses the verified self-extracting archive. No administrator access, OS PATH changes, document uploads, or automatic package updates are requested. Existing TeX installations are not removed. This copy is selected in User Settings for local builds; turn off security.useManagedTeX to switch back to system TeX. TinyTeX/TeX Live and font licenses and your organization’s software policies still apply.`
        },
        'Download and Install'
    )
    if (choice !== 'Download and Install' || !allowed()) {
        return false
    }
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Installing ${selected.label}`,
        cancellable: true
    }, async (progress, token) => {
        const controller = new AbortController()
        const cancellation = token.onCancellationRequested(() => controller.abort())
        const workspaceChange = vscode.workspace.onDidChangeWorkspaceFolders(() => controller.abort())
        const timeout = setTimeout(() => controller.abort(), 15 * 60 * 1000)
        try {
            if (token.isCancellationRequested || !allowed()) {
                return false
            }
            await installManagedTex(storage, { profile, signal: controller.signal, progress: message => progress.report({ message }) })
            if (controller.signal.aborted || !allowed()) {
                return false
            }
            if (!getSecureConfigurationValueSync(undefined, 'security.useManagedTeX', true)) {
                await vscode.workspace.getConfiguration('latex-workshop').update('security.useManagedTeX', true, vscode.ConfigurationTarget.Global)
            }
            await vscode.workspace.getConfiguration('latex-workshop').update('security.managedTeXProfile', profile, vscode.ConfigurationTarget.Global)
            return true
        } catch (error) {
            if (controller.signal.aborted) {
                void vscode.window.showInformationMessage('TeX installation was cancelled or timed out. Run setup again to retry. Existing installations were not removed.')
            } else {
                const detail = error instanceof Error ? error.message : 'Unknown installation error'
                const action = await vscode.window.showErrorMessage(`TeX installation did not finish: ${detail}`, 'Installation Guide')
                if (action === 'Installation Guide') {
                    await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(path.join(lw.extensionRoot, 'resources', 'local-setup.md')))
                }
            }
            return false
        } finally {
            clearTimeout(timeout)
            cancellation.dispose()
            workspaceChange.dispose()
        }
    })
}
