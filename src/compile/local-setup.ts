import * as path from 'path'
import * as vscode from 'vscode'
import { lw } from '../lw'
import { getSecureConfigurationValueSync, requireTrustedWorkspace } from '../utils/security'
import { getMissingBuildToolsMessage, getRequiredBuildToolDefinitions, inspectTexEnvironment, type TexToolRunner } from '../utils/tex-environment'
import { ensureMacTeXBinOnPath } from '../utils/tex-path'
import { getManagedTexEnvironment } from '../utils/managed-tex'
import { requestManagedTexInstall } from './tex-install'
import type { ManagedTexProfile } from '../utils/japanese-tex-manifest'
import { runBuildTool } from './tool-runner'
import { createFirstPdfSample } from './first-pdf'

const logger = lw.log('Local setup')

function canSetUpLocalTeX(): boolean {
    if (!requireTrustedWorkspace('Local TeX setup')) {
        return false
    }
    if (!vscode.workspace.workspaceFolders?.length || vscode.workspace.workspaceFolders.some(folder => folder.uri.scheme !== 'file')) {
        void vscode.window.showInformationMessage('Local TeX setup requires a filesystem workspace. Open a local project folder first.')
        return false
    }
    return true
}

export async function prepareLocalPdfLaTeX(scope: vscode.ConfigurationScope | undefined): Promise<boolean> {
    if (!canSetUpLocalTeX()) {
        return false
    }
    const alreadyAllowed = getSecureConfigurationValueSync(scope, 'security.allowLocalPdfLaTeX', false)
    if (!alreadyAllowed) {
        const selection = await vscode.window.showInformationMessage(
            'Set up your first LaTeX build',
            {
                modal: true,
                detail: 'Use the TeX tools installed on this computer. Docker is not needed for pdfLaTeX. This checks latexmk and pdflatex, then enables local builds in User Settings for all trusted workspaces. Local TeX can read files available to your OS account; use only documents you trust. Builds remain manual, with shell escape disabled.'
            },
            'Use Local TeX',
            'Docker Settings'
        )
        if (selection === 'Docker Settings') {
            await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:ToppyMicroServices.tex-workspace-secure docker')
            return false
        }
        if (selection !== 'Use Local TeX') {
            logger.log('Local TeX setup cancelled; no tools started or settings changed.')
            return false
        }
    }

    // Probe only after consent. Installation requires separate download consent;
    // missing tools alone must not persist an execution permission.
    while (true) {
        if (!vscode.workspace.isTrusted) {
            return false
        }
        ensureMacTeXBinOnPath()
        const profile = getSecureConfigurationValueSync<ManagedTexProfile>(scope, 'security.managedTeXProfile', 'lightweight')
        const managedEnv = getSecureConfigurationValueSync(scope, 'security.useManagedTeX', true) ? getManagedTexEnvironment(profile) : undefined
        const statuses = inspectTexEnvironment(runBuildTool as TexToolRunner, getRequiredBuildToolDefinitions('pdflatex'), managedEnv)
        const missing = statuses.filter(status => !status.available)
        if (missing.length === 0) {
            break
        }
        logger.log(`Required LaTeX tools unavailable: ${missing.map(status => `${status.command}: ${status.error}`).join('; ')}`)
        logger.refreshStatus('tools', 'statusBar.foreground', undefined, 'warning')
        const selection = await vscode.window.showErrorMessage(
            getMissingBuildToolsMessage(statuses),
            'Install Lightweight TeX',
            'Installation Guide',
            'Check Again'
        )
        if (selection === 'Install Lightweight TeX') {
            if (await requestManagedTexInstall()) {
                continue
            }
            return false
        }
        if (selection === 'Installation Guide') {
            await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(path.join(lw.extensionRoot, 'resources', 'local-setup.md')))
            return false
        }
        if (selection !== 'Check Again') {
            return false
        }
    }

    if (!vscode.workspace.isTrusted) {
        return false
    }
    if (!alreadyAllowed) {
        try {
            await vscode.workspace.getConfiguration('latex-workshop', scope).update(
                'security.allowLocalPdfLaTeX', true, vscode.ConfigurationTarget.Global
            )
        } catch (error) {
            logger.logError('Could not save local TeX setup.', error)
            void logger.showErrorMessageWithExtensionLogButton('Could not save local TeX setup in User Settings. No build was started. Check that your settings are writable, then try again.')
            return false
        }
        logger.log('Local pdfLaTeX setup saved in User Settings.')
    }
    return getSecureConfigurationValueSync(scope, 'security.allowLocalPdfLaTeX', false)
}

export async function setupLocalBuild(): Promise<void> {
    if (!canSetUpLocalTeX()) {
        return
    }
    const scope = vscode.window.activeTextEditor?.document.uri ?? vscode.workspace.workspaceFolders?.[0]?.uri
    if (getSecureConfigurationValueSync(scope, 'docker.enabled', false)) {
        const selection = await vscode.window.showInformationMessage(
            'Docker builds are already enabled. Local setup will not change your existing build mode.', 'Open Build Settings'
        )
        if (selection === 'Open Build Settings') {
            await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:ToppyMicroServices.tex-workspace-secure docker')
        }
        return
    }
    if (!await prepareLocalPdfLaTeX(scope)) {
        return
    }
    const selection = await vscode.window.showInformationMessage(
        'Local pdfLaTeX is ready. Save a .tex file in your workspace, then run Build LaTeX project. The PDF opens in a VS Code tab.', 'Create First-PDF Sample', 'Open First-PDF Guide'
    )
    if (selection === 'Open First-PDF Guide') {
        await vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.file(path.join(lw.extensionRoot, 'resources', 'local-setup.md')))
    } else if (selection === 'Create First-PDF Sample') {
        await createFirstPdfSample()
    }
}
