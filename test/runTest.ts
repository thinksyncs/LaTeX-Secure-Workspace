import * as path from 'path'
import * as process from 'process'
import * as cp from 'child_process'
import * as tmpFile from 'tmp'
import { downloadAndUnzipVSCode, TestRunFailedError, runTests } from '@vscode/test-electron'

type TempDir = ReturnType<typeof tmpFile.dirSync>
type VSCodeTestHost = {
    version?: string,
    vscodeExecutablePath?: string
}

export const DEFAULT_VSCODE_TEST_VERSION = '1.96.0'

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

// Integrated terminals inherit host-editor variables that break nested Electron launches.
function stripHostEditorEnv() {
    for (const key of Object.keys(process.env)) {
        if (blockedEnvKeys.has(key) || blockedEnvPrefixes.some(prefix => key.startsWith(prefix))) {
            delete process.env[key]
        }
    }
}

export function shouldBlockSandboxedElectron(platform = process.platform, env = process.env) {
    return platform === 'darwin' && env.CODEX_SANDBOX === 'seatbelt' && env.LATEXWORKSHOP_ALLOW_SANDBOX_ELECTRON !== '1'
}

export function shouldBackgroundMacOsTestHost(platform = process.platform, env = process.env) {
    return platform === 'darwin' && env.CI !== 'true' && env.LATEXWORKSHOP_FOREGROUND_TESTS !== '1'
}

export function getMacOsApplicationPath(vscodeExecutablePath: string) {
    const appMarker = '.app/'
    const markerIndex = vscodeExecutablePath.indexOf(appMarker)
    if (markerIndex === -1) {
        return undefined
    }
    return vscodeExecutablePath.slice(0, markerIndex + appMarker.length - 1)
}

export function resolveVSCodeTestHost(env: NodeJS.ProcessEnv = process.env): VSCodeTestHost {
    const vscodeExecutablePath = env.LATEXWORKSHOP_VSCODE_TEST_PATH?.trim()
    if (vscodeExecutablePath) {
        return { vscodeExecutablePath }
    }

    if (env.LATEXWORKSHOP_ALLOW_VSCODE_TEST_DOWNLOAD !== '1') {
        throw new Error([
            'VS Code integration tests require an explicit test host.',
            'Set LATEXWORKSHOP_VSCODE_TEST_PATH to an existing VS Code executable,',
            'or set LATEXWORKSHOP_ALLOW_VSCODE_TEST_DOWNLOAD=1 to let @vscode/test-electron download the pinned test host.'
        ].join(' '))
    }

    return {
        version: env.LATEXWORKSHOP_VSCODE_TEST_VERSION?.trim() || DEFAULT_VSCODE_TEST_VERSION
    }
}

function ensureSupportedElectronTestHost() {
    if (!shouldBlockSandboxedElectron()) {
        return
    }
    console.error('Electron integration tests cannot run inside the Codex seatbelt sandbox on macOS.')
    console.error('Run `npm test` or `npm run test:ci` from a normal terminal session, or rerun with sandbox access disabled.')
    console.error('Set LATEXWORKSHOP_ALLOW_SANDBOX_ELECTRON=1 only if you explicitly want to try the crash-prone sandbox path.')
    process.exit(1)
}

function snapshotEnv() {
    return { ...process.env }
}

function restoreEnv(snapshot: NodeJS.ProcessEnv) {
    for (const key of Object.keys(process.env)) {
        if (!(key in snapshot)) {
            delete process.env[key]
        }
    }
    for (const [key, value] of Object.entries(snapshot)) {
        if (value === undefined) {
            delete process.env[key]
        } else {
            process.env[key] = value
        }
    }
}

async function runMacOsTestsInBackground(options: {
    extensionDevelopmentPath: string,
    extensionTestsPath: string,
    launchArgs: string[],
    extensionTestsEnv: NodeJS.ProcessEnv
}) {
    const testHost = resolveVSCodeTestHost()
    const vscodeExecutablePath = testHost.vscodeExecutablePath ?? await downloadAndUnzipVSCode({ version: testHost.version })
    const appPath = getMacOsApplicationPath(vscodeExecutablePath)
    if (!appPath) {
        throw new Error(`Unable to derive macOS app bundle from VS Code executable: ${vscodeExecutablePath}`)
    }

    const args = [
        '-g',
        '-j',
        '-n',
        '-W',
        '-a',
        appPath,
        '--args',
        ...options.launchArgs,
        '--no-sandbox',
        '--disable-gpu-sandbox',
        '--disable-updates',
        '--skip-welcome',
        '--skip-release-notes',
        '--disable-workspace-trust',
        `--extensionTestsPath=${options.extensionTestsPath}`,
        `--extensionDevelopmentPath=${options.extensionDevelopmentPath}`
    ]

    await new Promise<number>((resolve, reject) => {
        const fullEnv = { ...process.env, ...options.extensionTestsEnv }
        const child = cp.spawn('open', args, {
            env: fullEnv,
            stdio: 'inherit'
        })

        child.on('error', reject)
        child.on('close', code => {
            if (code !== 0) {
                reject(new TestRunFailedError(code ?? undefined, undefined))
                return
            }
            resolve(code ?? 0)
        })
    })
}

function makeTempDir(): TempDir {
    return tmpFile.dirSync({ unsafeCleanup: true })
}

async function runTestSuites(fixture: 'testground' | 'multiroot' | 'unittest') {
    const envSnapshot = snapshotEnv()
    const userDataDir = makeTempDir()
    const extensionsDir = makeTempDir()
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../')
        const extensionTestsPath = fixture === 'unittest' ? path.resolve(__dirname, './units/index') : path.resolve(__dirname, './suites/index')
        const launchArgs = [
            'test/fixtures/' + fixture + (fixture === 'multiroot' ? '/resource.code-workspace' : ''),
            '--user-data-dir=' + userDataDir.name,
            '--extensions-dir=' + extensionsDir.name,
            '--disable-gpu',
            '--use-inmemory-secretstorage'
        ]
        const extensionTestsEnv = {
            LATEXWORKSHOP_CITEST: '1'
        }

        if (shouldBackgroundMacOsTestHost()) {
            await runMacOsTestsInBackground({
                extensionDevelopmentPath,
                extensionTestsPath,
                launchArgs,
                extensionTestsEnv
            })
        } else {
            await runTests({
                ...resolveVSCodeTestHost(),
                extensionDevelopmentPath,
                extensionTestsPath,
                launchArgs,
                extensionTestsEnv
            })
        }
    } catch (error) {
        console.error(error)
        console.error('Failed to run tests')
        process.exit(1)
    } finally {
        restoreEnv(envSnapshot)
        userDataDir.removeCallback()
        extensionsDir.removeCallback()
    }
}

async function main() {
    try {
        ensureSupportedElectronTestHost()
        stripHostEditorEnv()
        await runTestSuites('unittest')
        await runTestSuites('testground')
        await runTestSuites('multiroot')
    } catch (_) {
        console.error('Failed to run tests')
        process.exit(1)
    }
}

if (require.main === module) {
    void main()
}
