import * as path from 'path'
import * as vscode from 'vscode'
import { lw } from '../lw'
import { getSecureConfigurationValueSync, requireTrustedWorkspace } from '../utils/security'
import { getCurrentTinyTexAsset, getManagedTexStorage, installManagedTex, prepareManagedTexBundle,
    needsPrivateTexStorage, usesPrivateTexStorage, validatePrivateTexStorage, rememberManagedTexStorage } from '../utils/managed-tex'
import { TINYTEX_VERSION, tinyTexDownloadUrl } from '../utils/tinytex-manifest'
import { JAPANESE_TEX_SOURCE, managedTexDirectory, type ManagedTexProfile } from '../utils/japanese-tex-manifest'

let pending: Promise<boolean> | undefined
let pendingMode: 'download' | 'import' | 'prepare' | undefined

function allowed(): boolean {
    return requireTrustedWorkspace('TeX installation') && !vscode.env.remoteName
        && Boolean(vscode.workspace.workspaceFolders?.length)
        && !vscode.workspace.workspaceFolders?.some(folder => folder.uri.scheme !== 'file')
}

export async function requestManagedTexInstall(mode: 'download' | 'import' | 'prepare' = 'download'): Promise<boolean> {
    if (pending) {
        if (pendingMode !== mode) {
            void vscode.window.showInformationMessage('Another TeX operation is running. Wait for it to finish or cancel it, then retry.')
            return false
        }
        return pending
    }
    pendingMode = mode
    pending = installWithConsent(mode)
    try {
        return await pending
    } finally {
        pending = undefined
        pendingMode = undefined
    }
}

async function installWithConsent(mode: 'download' | 'import' | 'prepare'): Promise<boolean> {
    if (!allowed()) {
        void vscode.window.showInformationMessage('Automatic TeX installation requires a trusted local folder in a local VS Code window. Remote hosts are not modified; use the installation guide there.')
        return false
    }
    const asset = getCurrentTinyTexAsset()
    let storage = getManagedTexStorage()
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
    let privateStorage = false
    let choosePrivateStorage = needsPrivateTexStorage(storage)
    let invalidSavedStorage = false
    if (mode !== 'prepare' && usesPrivateTexStorage()) {
        try {
            await validatePrivateTexStorage(storage, path.join(lw.extensionRoot, 'resources', 'check-private-tex-storage.ps1'))
        } catch {
            // Keep the old approval until a replacement is explicitly selected
            // and installed. A deleted folder or changed ACL must be recoverable.
            choosePrivateStorage = true
            invalidSavedStorage = true
        }
        if (!allowed()) { return false }
    }
    if (mode !== 'prepare' && choosePrivateStorage) {
        const choose = await vscode.window.showInformationMessage(invalidSavedStorage
            ? 'The saved private TeX folder is unavailable or no longer meets its ownership and permission requirements.'
            : 'TinyTeX needs an ASCII installation path on Windows.', {
            modal: true,
            detail: 'Choose an existing private folder owned by your Windows account. Only your account, SYSTEM and Administrators may have access, and inherited permissions must be disabled. Ask IT to provision one if needed. No shared fallback, permission changes or elevation are performed. The selection is saved locally only after a successful installation. The bundled Windows runner also needs an ASCII project path on some system locales; choosing this installation folder does not move your project.'
        }, 'Choose Private Folder')
        if (choose !== 'Choose Private Folder' || !allowed()) { return false }
        const folders = await vscode.window.showOpenDialog({ title: 'Choose private ASCII TeX storage',
            canSelectFolders: true, canSelectFiles: false, canSelectMany: false })
        if (!folders?.[0] || folders[0].scheme !== 'file' || !allowed()) { return false }
        storage = folders[0].fsPath
        privateStorage = true
    }
    let offlineDirectory: string | undefined
    if (mode !== 'download') {
        const folders = await vscode.window.showOpenDialog({
            title: mode === 'import' ? 'Select a prepared TeX archive folder' : 'Choose where to prepare an offline TeX bundle',
            canSelectFolders: true, canSelectFiles: false, canSelectMany: false
        })
        if (!folders?.[0] || folders[0].scheme !== 'file' || !allowed()) { return false }
        offlineDirectory = folders[0].fsPath
    }
    const confirm = mode === 'import' ? 'Verify and Install Offline' : mode === 'prepare' ? 'Download Bundle' : 'Download and Install'
    const choice = await vscode.window.showInformationMessage(
        mode === 'prepare' ? `Prepare ${selected.label} for offline use?` : `Install ${selected.label} for this extension?`,
        {
            modal: true,
            detail: mode === 'import'
                ? `Read TinyTeX-1 ${TINYTEX_VERSION} and ${profile} support only from:\n${offlineDirectory}\n\nInstall to:\n${path.join(storage, managedTexDirectory(profile))}\n\nExact extension-pinned sizes and SHA-256 hashes are checked before extraction. No download fallback, administrator access, OS PATH changes or automatic builds. Windows runs only the verified self-extracting archive. Existing installations are not overwritten. This profile is selected in User Settings; local build permission requires separate consent. The imported TeX and font licenses and your organization’s software policies still apply.`
                : `Download TinyTeX-1 ${TINYTEX_VERSION} (about ${Math.ceil(asset.bytes / 1024 / 1024)} MiB; more space is needed after extraction) from:\n${tinyTexDownloadUrl(asset)}${profile === 'japanese' ? `\n\nJapanese support: CJK and IPAex Type1 Mincho/Gothic, including licenses (about 15 MiB), from the CTAN mirror (size and SHA-256 pinned):\n${JAPANESE_TEX_SOURCE}\nThis supports the supplied pdfLaTeX Japanese sample; LuaLaTeX still requires Docker.` : ''}\n\n${mode === 'prepare' ? `Save a new bundle folder inside:\n${offlineDirectory}\nNo installation or settings changes. Prepare for the same OS/architecture as the destination.` : `Install to:\n${path.join(storage, managedTexDirectory(profile))}\nThis copy is selected in User Settings for local builds; turn off security.useManagedTeX to switch back to system TeX.`}\n\nAll downloads are checked against pinned SHA-256 values before extraction. Windows installation uses the verified self-extracting archive. No administrator access, OS PATH changes, document uploads, or automatic package updates are requested. Existing TeX installations are not removed. TinyTeX/TeX Live and font licenses and your organization’s software policies still apply.`
        },
        confirm
    )
    if (choice !== confirm || !allowed()) {
        return false
    }
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `${mode === 'prepare' ? 'Preparing' : 'Installing'} ${selected.label}`,
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
            const options = { profile, signal: controller.signal, progress: (message: string) => progress.report({ message }) }
            if (mode === 'prepare') {
                const bundle = await prepareManagedTexBundle(offlineDirectory!, options)
                void vscode.window.showInformationMessage(`Offline TeX bundle saved to ${bundle}. Transfer this folder through your approved channel. Nothing was installed.`)
                return true
            }
            if (privateStorage || usesPrivateTexStorage()) {
                await validatePrivateTexStorage(storage, path.join(lw.extensionRoot, 'resources', 'check-private-tex-storage.ps1'))
                if (controller.signal.aborted || !allowed()) { return false }
            }
            await installManagedTex(storage, { ...options, ...(mode === 'import' ? { offlineDirectory } : {}) })
            if (controller.signal.aborted || !allowed()) {
                return false
            }
            if (privateStorage) { await rememberManagedTexStorage(storage) }
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
