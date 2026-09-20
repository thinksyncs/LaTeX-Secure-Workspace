import vscode from 'vscode'
import type { SpawnSyncOptions } from 'child_process'
import { lw } from '../lw'
import { resolveWindowsBuildTool, windowsBuildEnvironment, windowsToolInvocation } from '../utils/windows-build'

export function runBuildTool(command: string, args: readonly string[], options: SpawnSyncOptions = {}) {
    if (process.platform !== 'win32') {
        return lw.external.sync(command, args, options)
    }
    const roots = vscode.workspace.workspaceFolders?.filter(folder => folder.uri.scheme === 'file').map(folder => folder.uri.fsPath) ?? []
    const env = windowsBuildEnvironment(options.env ?? process.env, roots)
    const resolved = resolveWindowsBuildTool(command, env, roots)
    const invocation = windowsToolInvocation(resolved, args, env, roots)
    return lw.external.sync(invocation.command, invocation.args, {
        ...options, env: invocation.env, windowsVerbatimArguments: invocation.windowsVerbatimArguments
    })
}
