import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const blockedEnvKeys = new Set([
    'ELECTRON_RUN_AS_NODE',
    'LD_PRELOAD',
    'LD_LIBRARY_PATH',
    'NODE_OPTIONS',
    'NODE_PATH'
])
const blockedEnvPrefixes = [
    'DYLD_',
    'VSCODE_'
]
const filteredSubstrings = [
    'product.json#extensionEnabledApiProposals',
    'Failed to connect to the bus:',
    'is not in the list of known options',
    'gpu_memory_buffer_support_x11',
    'CoreText note:',
    'CTFontLogSystemFontNameRequest',
    'error messaging the mach port for IMKCFRunLoopWakeUpReliable'
]

export function sanitizeTestEnvironment(env = process.env) {
    const sanitizedEnv = { ...env }
    for (const key of Object.keys(sanitizedEnv)) {
        if (blockedEnvKeys.has(key) || blockedEnvPrefixes.some(prefix => key.startsWith(prefix))) {
            delete sanitizedEnv[key]
        }
    }
    return sanitizedEnv
}

export function shouldBlockSandboxedElectron(platform = process.platform, env = process.env) {
    return platform === 'darwin' && env.CODEX_SANDBOX === 'seatbelt' && env.LATEXWORKSHOP_ALLOW_SANDBOX_ELECTRON !== '1'
}

function shouldFilter(line) {
    return filteredSubstrings.some(substring => line.includes(substring))
}

function pipeFiltered(stream, output) {
    let buffer = ''
    stream.setEncoding('utf8')

    stream.on('data', chunk => {
        buffer += chunk
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        for (const line of lines) {
            if (!shouldFilter(line)) {
                output.write(line + '\n')
            }
        }
    })

    stream.on('end', () => {
        if (buffer && !shouldFilter(buffer)) {
            output.write(buffer)
        }
    })
}

function runElectronTests(env) {
    return new Promise((resolve, reject) => {
        const useXvfb = env.CI_USE_XVFB === '1'
        const command = useXvfb ? 'xvfb-run' : process.execPath
        const args = useXvfb ? ['-a', process.execPath, './out/test/runTest.js'] : ['./out/test/runTest.js']

        const child = spawn(command, args, {
            cwd: workspaceRoot,
            env,
            stdio: ['ignore', 'pipe', 'pipe']
        })

        child.on('error', reject)

        pipeFiltered(child.stdout, process.stdout)
        pipeFiltered(child.stderr, process.stderr)

        child.on('close', code => {
            if (code === 0) {
                resolve()
                return
            }
            reject(new Error(`Electron integration tests failed with exit code ${code ?? 1}.`))
        })
    })
}

async function main() {
    const env = sanitizeTestEnvironment(process.env)

    try {
        if (shouldBlockSandboxedElectron(process.platform, env)) {
            console.error('Electron integration tests cannot run inside the Codex seatbelt sandbox on macOS.')
            console.error('Run `npm run test:ci` from a normal terminal session, or rerun with sandbox access disabled.')
            console.error('Set LATEXWORKSHOP_ALLOW_SANDBOX_ELECTRON=1 only if you explicitly want to try the crash-prone sandbox path.')
            process.exit(1)
        }
        await runElectronTests(env)
    } catch (error) {
        console.error(error.message)
        process.exit(1)
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main()
}
