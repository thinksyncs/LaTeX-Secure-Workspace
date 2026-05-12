import * as vscode from 'vscode'
import { lw } from '../lw'
import { confirmWorkspaceCommandExecution, getSecureConfigurationValue } from '../utils/security'

const logger = lw.log('TeXDoc')

export {
    texdoc
}

async function runTexdoc(packageName: string) {
    const scope = lw.root.file.path ? lw.file.toUri(lw.root.file.path) : vscode.window.activeTextEditor?.document.uri ?? vscode.workspace.workspaceFolders?.[0]?.uri
    const texdocPath = await getSecureConfigurationValue(scope, 'texdoc.path', 'texdoc')
    const texdocArgs = Array.from(await getSecureConfigurationValue(scope, 'texdoc.args', [] as string[]))

    if (!await confirmWorkspaceCommandExecution(scope, 'texdoc.path', texdocPath)) {
        return
    }

    texdocArgs.push(packageName)
    logger.logCommand('Run texdoc command', texdocPath, texdocArgs)
    const proc = lw.external.spawn(texdocPath, texdocArgs, {})
    proc.stdout?.setEncoding('utf8')
    proc.stderr?.setEncoding('utf8')

    let stdout = ''
    proc.stdout?.on('data', newStdout => {
        stdout += newStdout
    })

    let stderr = ''
    proc.stderr?.on('data', newStderr => {
        stderr += newStderr
    })

    proc.on('error', err => {
        logger.log(`Cannot run texdoc: ${err.message}, ${stderr}`)
        void logger.showErrorMessage('Texdoc failed. Please refer to LaTeX-Secure-Workspace Output for details.')
    })

    proc.on('exit', exitCode => {
        if (exitCode !== 0) {
            logger.logError(`Cannot find documentation for ${packageName}.`, exitCode)
            void logger.showErrorMessage('Texdoc failed. Please refer to LaTeX-Secure-Workspace Output for details.')
        } else {
            const regex = new RegExp(`(no documentation found)|(Documentation for ${packageName} could not be found)`)
            if (stdout.match(regex) || stderr.match(regex)) {
                logger.log(`Cannot find documentation for ${packageName}.`)
                void logger.showErrorMessage(`Cannot find documentation for ${packageName}.`)
            } else {
                logger.log(`Opening documentation for ${packageName}.`)
            }
        }
        logger.log(`texdoc stdout: ${stdout}`)
        logger.log(`texdoc stderr: ${stderr}`)
    })
}

async function texdoc(packageName?: string, useonly = false) {
    if (packageName) {
        await runTexdoc(packageName)
        return
    }
    if (useonly) {
        const names: Set<string> = new Set()
        for (const tex of lw.cache.getIncludedTeX()) {
            const content = lw.cache.get(tex)
            const pkgs = content && content.elements.package
            if (!pkgs) {
                continue
            }
            Object.keys(pkgs).forEach(pkg => names.add(pkg))
        }
        const packageNames = Array.from(new Set(names))
        const items: vscode.QuickPickItem[] = packageNames.map(pkg => ({ label: pkg }))
        const selectedPkg = await vscode.window.showQuickPick(items)
        if (!selectedPkg) {
            return
        }
        await runTexdoc(selectedPkg.label)
        return
    }
    const selectedPkg = await vscode.window.showInputBox({value: '', prompt: 'Package name'})
    if (!selectedPkg) {
        return
    }
    await runTexdoc(selectedPkg)
}
