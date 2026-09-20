import fs from 'fs'
import path from 'path'

function inside(root: string, file: string): boolean {
    const relative = path.relative(root, file)
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
}

function fullyQualified(file: string): boolean {
    if (!path.isAbsolute(file)) {
        return false
    }
    // win32.isAbsolute also accepts \tools, whose drive changes with cwd.
    return process.platform !== 'win32' || /^[a-z]:[\\/]/i.test(file) || /^[\\/]{2}[^\\/]+[\\/][^\\/]+(?:[\\/]|$)/.test(file)
}

function workspaceRoots(roots: readonly string[]): string[] {
    return roots.flatMap(root => {
        const absolute = path.resolve(root)
        try {
            return [absolute, fs.realpathSync(root)]
        } catch (error) {
            if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
                // A stale multi-root entry must not disable another folder.
                // Keep its lexical boundary even while the folder is absent.
                return [absolute]
            }
            throw error
        }
    })
}

/** Resolve search directories before entering a document-controlled cwd. */
export function windowsBuildEnvironment(base: NodeJS.ProcessEnv, roots: readonly string[]): NodeJS.ProcessEnv {
    const env = { ...base }
    const keys = Object.keys(env).filter(key => key.toLowerCase() === 'path').sort()
    const search = env[keys[0] ?? 'PATH'] ?? ''
    keys.forEach(key => { delete env[key] })
    const realRoots = workspaceRoots(roots)
    env.PATH = search.split(';').map(entry => entry.replace(/^"(.*)"$/, '$1')).filter(entry => {
        if (!fullyQualified(entry)) {
            return false
        }
        try {
            const real = fs.realpathSync(entry)
            return fs.statSync(real).isDirectory() && !realRoots.some(root => inside(root, real))
        } catch {
            return false
        }
    }).join(';')
    // Supplementary protection for approved tools which invoke cmd.exe.
    env.NoDefaultCurrentDirectoryInExePath = '1'
    return env
}

export function resolveWindowsBuildTool(command: string, env: NodeJS.ProcessEnv, roots: readonly string[]): string {
    const realRoots = workspaceRoots(roots)
    const directories = fullyQualified(command) ? [''] : (env.PATH ?? '').split(';').filter(fullyQualified)
    if (!fullyQualified(command) && /[\\/:]/.test(command)) {
        throw new Error(`Use a fully qualified absolute installed tool path, not a relative command: ${command}`)
    }
    const extensions = path.extname(command) ? [''] : ['.exe', '.com', '.cmd', '.bat']
    for (const directory of directories) {
        for (const extension of extensions) {
            const candidate = path.join(directory, command + extension)
            try {
                const real = fs.realpathSync(candidate)
                if (fs.statSync(real).isFile() && !realRoots.some(root => inside(root, real))) {
                    return path.resolve(candidate)
                }
            } catch {
                // Try the next approved directory; never fall back to cwd.
            }
        }
    }
    throw new Error(`Cannot find ${command} outside the project in the installed tools PATH. Check your approved TeX or Docker installation.`)
}

// Windows cmd escaping follows cross-spawn (MIT), already used by this project.
// Invoke an absolute system shell ourselves: cross-spawn's bare shell fallback
// would introduce another project-directory lookup.
function escapeCmd(value: string, argument: boolean): string {
    if (argument) {
        value = value.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"').replace(/(?=(\\+?)?)\1$/, '$1$1')
        value = `"${value}"`
    }
    return value.replace(/([()\][%!^"`<>&|;, *?])/g, '^$1')
}

export function windowsToolInvocation(command: string, args: readonly string[], env: NodeJS.ProcessEnv, roots: readonly string[]) {
    if (/\.(exe|com)$/i.test(command)) {
        return { command, args: [...args], env, windowsVerbatimArguments: false }
    }
    if (!/\.(cmd|bat)$/i.test(command)) {
        throw new Error('Windows builds require an installed executable or batch wrapper.')
    }
    // Carets do not prevent percent expansion by cmd.exe. Do not reinterpret
    // document-controlled arguments; native executable arguments need no shell.
    if ([command, ...args].some(value => /[%\r\n]/.test(value))) {
        throw new Error('Percent signs and line breaks are unsupported in Windows batch command paths or arguments. Use a native executable or a path without these characters.')
    }
    const shell = resolveWindowsBuildTool(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe'), env, roots)
    const line = [escapeCmd(command, false), ...args.map(arg => escapeCmd(arg, true))].join(' ')
    return { command: shell, args: ['/d', '/v:off', '/s', '/c', `"${line}"`], env, windowsVerbatimArguments: true }
}

/** Bind both the host launcher and the fixed local recipe's child tools. */
export function prepareWindowsBuild(
    command: string, args: readonly string[], base: NodeJS.ProcessEnv, roots: readonly string[], policyFile: string,
    dockerRuntime?: string
) {
    const env = windowsBuildEnvironment(base, roots)
    // Extension startup also exports Docker defaults globally. Only the
    // selected recipe's own runtime value selects the Docker launch path.
    if (dockerRuntime !== undefined) {
        env.LATEXWORKSHOP_DOCKER_PATH = resolveWindowsBuildTool(dockerRuntime, env, roots)
        return windowsToolInvocation(command, args, env, roots)
    }
    const driver = resolveWindowsBuildTool(command, env, roots)
    for (const tool of ['pdflatex', 'bibtex', 'biber', 'makeindex', 'kpsewhich']) {
        const key = `LW_SECURE_${tool.toUpperCase()}`
        // Never inherit a caller's replacement for an optional missing tool.
        delete env[key]
        try {
            const executable = resolveWindowsBuildTool(tool, env, roots)
            if (!/\.(exe|com)$/i.test(executable) || /[%"\r\n]/.test(executable)) {
                throw new Error(`Unsupported ${tool} executable path: ${executable}`)
            }
            env[key] = executable
        } catch (error) {
            if (tool === 'pdflatex' || tool === 'kpsewhich') {
                throw error
            }
        }
    }
    return windowsToolInvocation(driver, ['-norc', '-r', policyFile, ...args], env, roots)
}
