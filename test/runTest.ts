import * as path from 'path'
import * as process from 'process'
import * as tmpFile from 'tmp'
import { runTests } from '@vscode/test-electron'

type TempDir = ReturnType<typeof tmpFile.dirSync>

// Integrated terminals inherit host-editor variables that break nested Electron launches.
function stripHostEditorEnv() {
    for (const key of Object.keys(process.env)) {
        if (key === 'ELECTRON_RUN_AS_NODE' || key.startsWith('VSCODE_')) {
            delete process.env[key]
        }
    }
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

        await runTests({
            version: '1.96.0',
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                'test/fixtures/' + fixture + (fixture === 'multiroot' ? '/resource.code-workspace' : ''),
                '--user-data-dir=' + userDataDir.name,
                '--extensions-dir=' + extensionsDir.name,
                '--disable-gpu',
                '--use-inmemory-secretstorage'
            ],
            extensionTestsEnv: {
                LATEXWORKSHOP_CITEST: '1'
            }
        })
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
        stripHostEditorEnv()
        await runTestSuites('unittest')
        await runTestSuites('testground')
        await runTestSuites('multiroot')
    } catch (_) {
        console.error('Failed to run tests')
        process.exit(1)
    }
}

void main()
