const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../dev/runTestCi.mjs')).href

test('sanitizeTestEnvironment removes env-based injection vectors and keeps CI flags', async () => {
    const { sanitizeTestEnvironment } = await import(moduleUrl)
    const env = {
        CI_USE_XVFB: '1',
        DYLD_INSERT_LIBRARIES: '/tmp/evil.dylib',
        ELECTRON_RUN_AS_NODE: '1',
        HOME: '/tmp/home',
        LATEXWORKSHOP_ALLOW_SANDBOX_ELECTRON: '1',
        LATEXWORKSHOP_CITEST: '1',
        LD_LIBRARY_PATH: '/tmp/evil-lib',
        LD_PRELOAD: '/tmp/evil.so',
        NODE_OPTIONS: '--require /tmp/evil.js',
        NODE_PATH: '/tmp/node-path',
        PATH: '/usr/bin:/bin',
        VSCODE_IPC_HOOK: '/tmp/ipc'
    }

    const sanitized = sanitizeTestEnvironment(env)

    assert.notStrictEqual(sanitized, env)
    assert.equal(sanitized.CI_USE_XVFB, '1')
    assert.equal(sanitized.HOME, '/tmp/home')
    assert.equal(sanitized.LATEXWORKSHOP_ALLOW_SANDBOX_ELECTRON, '1')
    assert.equal(sanitized.LATEXWORKSHOP_CITEST, '1')
    assert.equal(sanitized.PATH, '/usr/bin:/bin')
    assert.equal(sanitized.DYLD_INSERT_LIBRARIES, undefined)
    assert.equal(sanitized.ELECTRON_RUN_AS_NODE, undefined)
    assert.equal(sanitized.LD_LIBRARY_PATH, undefined)
    assert.equal(sanitized.LD_PRELOAD, undefined)
    assert.equal(sanitized.NODE_OPTIONS, undefined)
    assert.equal(sanitized.NODE_PATH, undefined)
    assert.equal(sanitized.VSCODE_IPC_HOOK, undefined)
})

test('shouldBlockSandboxedElectron only blocks the macOS Codex seatbelt path by default', async () => {
    const { shouldBlockSandboxedElectron } = await import(moduleUrl)

    assert.equal(
        shouldBlockSandboxedElectron('darwin', { CODEX_SANDBOX: 'seatbelt' }),
        true
    )
    assert.equal(
        shouldBlockSandboxedElectron('darwin', {
            CODEX_SANDBOX: 'seatbelt',
            LATEXWORKSHOP_ALLOW_SANDBOX_ELECTRON: '1'
        }),
        false
    )
    assert.equal(
        shouldBlockSandboxedElectron('linux', { CODEX_SANDBOX: 'seatbelt' }),
        false
    )
})
