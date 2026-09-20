import fs from 'fs'
import path from 'path'

function inside(root: string, file: string): boolean {
    const relative = path.relative(root, file)
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
}

/** Resolve search directories before entering a document-controlled cwd. */
export function windowsBuildEnvironment(base: NodeJS.ProcessEnv, roots: readonly string[]): NodeJS.ProcessEnv {
    const env = { ...base }
    const keys = Object.keys(env).filter(key => key.toLowerCase() === 'path').sort()
    const search = env[keys[0] ?? 'PATH'] ?? ''
    keys.forEach(key => { delete env[key] })
    const realRoots = roots.map(root => fs.realpathSync(root))
    env.PATH = search.split(';').map(entry => entry.replace(/^"(.*)"$/, '$1')).filter(entry => {
        if (!path.isAbsolute(entry)) {
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
    const realRoots = roots.map(root => fs.realpathSync(root))
    const directories = path.isAbsolute(command) ? [''] : (env.PATH ?? '').split(';').filter(Boolean)
    if (!path.isAbsolute(command) && /[\\/:]/.test(command)) {
        throw new Error(`Use an absolute installed tool path, not a relative command: ${command}`)
    }
    const extensions = path.extname(command) ? [''] : ['.exe', '.com', '.cmd', '.bat']
    for (const directory of directories) {
        for (const extension of extensions) {
            const candidate = path.join(directory, command + extension)
            try {
                const real = fs.realpathSync(candidate)
                if (fs.statSync(real).isFile() && !realRoots.some(root => inside(root, real))) {
                    return candidate
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
    const shell = resolveWindowsBuildTool(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'cmd.exe'), env, roots)
    const line = [escapeCmd(command, false), ...args.map(arg => escapeCmd(arg, true))].join(' ')
    return { command: shell, args: ['/d', '/v:off', '/s', '/c', `"${line}"`], env, windowsVerbatimArguments: true }
}

/** Bind both the host launcher and the fixed local recipe's child tools. */
export function prepareWindowsBuild(
    command: string, args: readonly string[], base: NodeJS.ProcessEnv, roots: readonly string[], policyFile: string
) {
    const env = windowsBuildEnvironment(base, roots)
    if (env.LATEXWORKSHOP_DOCKER_PATH !== undefined) {
        env.LATEXWORKSHOP_DOCKER_PATH = resolveWindowsBuildTool(env.LATEXWORKSHOP_DOCKER_PATH, env, roots)
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
