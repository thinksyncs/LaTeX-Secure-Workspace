import * as vscode from 'vscode'

import { lw } from '../lw'

const logger = lw.log('Security')

const warnedWorkspaceCommands = new Set<string>()
const approvedWorkspaceCommands = new Set<string>()
const blockedWorkspaceOverrides = new Set<string>()
const blockedWorkspaceCommands = new Set<string>()
const ignoredWorkspaceOverrides = new Set<string>()

type InspectValue<T> = {
    defaultValue?: T,
    globalValue?: T,
    workspaceValue?: T,
    workspaceFolderValue?: T
}

function getScopeKey(scope?: vscode.ConfigurationScope): string {
    if (scope === undefined || scope === null) {
        return 'global'
    }
    if (scope instanceof vscode.Uri) {
        return scope.toString(true)
    }
    if ('uri' in scope && scope.uri instanceof vscode.Uri) {
        return scope.uri.toString(true)
    }
    return JSON.stringify(scope)
}

export async function confirmWorkspaceCommandExecution(scope: vscode.ConfigurationScope | undefined, section: string, command: string): Promise<boolean> {
    const configuration = vscode.workspace.getConfiguration('latex-workshop', scope)
    const inspect = configuration.inspect<string>(section)
    if (!inspect) {
        return true
    }

    let configScope: 'workspace' | 'workspace folder' | undefined
    if (inspect.workspaceFolderValue !== undefined) {
        configScope = 'workspace folder'
    } else if (inspect.workspaceValue !== undefined) {
        configScope = 'workspace'
    }
    if (!configScope) {
        return true
    }

    const key = `${section}:${command}:${configScope}:${getScopeKey(scope)}`
    if (approvedWorkspaceCommands.has(key)) {
        return true
    }

    if (blockedWorkspaceCommands.has(key)) {
        return false
    }
    blockedWorkspaceCommands.add(key)

    logger.log(`Workspace-scoped command blocked for latex-workshop.${section}: ${command}`)
    const selection = await vscode.window.showWarningMessage(
        `The ${configScope} setting "latex-workshop.${section}" is disabled in this secure build. Move "${command}" to your user settings if you still need it.`,
        { modal: true },
        'Open Settings'
    )
    if (selection === 'Open Settings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', `latex-workshop.${section}`)
    }
    return false
}

export function warnWorkspaceCommandSetting(scope: vscode.ConfigurationScope | undefined, section: string): void {
    const configuration = vscode.workspace.getConfiguration('latex-workshop', scope)
    const inspect = configuration.inspect<string>(section)
    if (!inspect) {
        return
    }

    let configScope: 'workspace' | 'workspace folder' | undefined
    let command: string | undefined
    if (inspect.workspaceFolderValue !== undefined) {
        configScope = 'workspace folder'
        command = inspect.workspaceFolderValue
    } else if (inspect.workspaceValue !== undefined) {
        configScope = 'workspace'
        command = inspect.workspaceValue
    }
    if (!configScope || !command) {
        return
    }

    const key = `${section}:${command}:${configScope}:${getScopeKey(scope)}`
    if (warnedWorkspaceCommands.has(key)) {
        return
    }
    warnedWorkspaceCommands.add(key)

    logger.log(`Workspace-scoped command configured for latex-workshop.${section}: ${command}`)
    void vscode.window.showWarningMessage(
        `The ${configScope} setting "latex-workshop.${section}" overrides the executable path with "${command}" in this trusted workspace. Review the workspace settings if this is unexpected.`,
        'Open Settings'
    ).then(selection => {
        if (selection === 'Open Settings') {
            return vscode.commands.executeCommand('workbench.action.openSettings', `latex-workshop.${section}`)
        }
        return undefined
    })
}

export async function confirmNoWorkspaceConfigurationOverride(scope: vscode.ConfigurationScope | undefined, section: string): Promise<boolean> {
    const configuration = vscode.workspace.getConfiguration('latex-workshop', scope)
    const inspect = configuration.inspect(section)
    if (!inspect) {
        return true
    }

    let configScope: 'workspace' | 'workspace folder' | undefined
    if (inspect.workspaceFolderValue !== undefined) {
        configScope = 'workspace folder'
    } else if (inspect.workspaceValue !== undefined) {
        configScope = 'workspace'
    }
    if (!configScope) {
        return true
    }

    const key = `${section}:${configScope}:${getScopeKey(scope)}`
    if (blockedWorkspaceOverrides.has(key)) {
        return false
    }
    blockedWorkspaceOverrides.add(key)

    logger.log(`Workspace-scoped override blocked for latex-workshop.${section}`)
    const selection = await vscode.window.showWarningMessage(
        `The ${configScope} setting "latex-workshop.${section}" is disabled in this secure build. Move it to your user settings if you still need it.`,
        { modal: true },
        'Open Settings'
    )
    if (selection === 'Open Settings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', `latex-workshop.${section}`)
    }
    return false
}

function getNonWorkspaceValue<T>(inspect: InspectValue<T>, fallback: T): T {
    return inspect.globalValue ?? inspect.defaultValue ?? fallback
}

export function getSecureConfigurationValueSync<T>(scope: vscode.ConfigurationScope | undefined, section: string, fallback: T): T {
    const configuration = vscode.workspace.getConfiguration('latex-workshop', scope)
    const inspect = configuration.inspect<T>(section)
    if (!inspect) {
        return fallback
    }

    if (inspect.workspaceFolderValue !== undefined || inspect.workspaceValue !== undefined) {
        const configScope = inspect.workspaceFolderValue !== undefined ? 'workspace folder' : 'workspace'
        const key = `${section}:${configScope}:${getScopeKey(scope)}`
        if (!ignoredWorkspaceOverrides.has(key)) {
            ignoredWorkspaceOverrides.add(key)
            logger.log(`Ignoring ${configScope}-scoped override for latex-workshop.${section} in secure build.`)
        }
        return getNonWorkspaceValue(inspect, fallback)
    }

    return configuration.get(section, fallback)
}

export async function getSecureConfigurationValue<T>(scope: vscode.ConfigurationScope | undefined, section: string, fallback: T): Promise<T> {
    const configuration = vscode.workspace.getConfiguration('latex-workshop', scope)
    const inspect = configuration.inspect<T>(section)
    if (!inspect) {
        return fallback
    }

    if (!await confirmNoWorkspaceConfigurationOverride(scope, section)) {
        return getNonWorkspaceValue(inspect, fallback)
    }

    return configuration.get(section, fallback)
}
