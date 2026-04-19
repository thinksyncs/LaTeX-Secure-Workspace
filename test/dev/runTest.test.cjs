const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../out/test/runTest.js')).href

test('shouldBackgroundMacOsTestHost only enables background launch on local macOS by default', async () => {
    const { shouldBackgroundMacOsTestHost } = await import(moduleUrl)

    assert.equal(
        shouldBackgroundMacOsTestHost('darwin', {}),
        true
    )
    assert.equal(
        shouldBackgroundMacOsTestHost('darwin', { CI: 'true' }),
        false
    )
    assert.equal(
        shouldBackgroundMacOsTestHost('darwin', { LATEXWORKSHOP_FOREGROUND_TESTS: '1' }),
        false
    )
    assert.equal(
        shouldBackgroundMacOsTestHost('linux', {}),
        false
    )
})

test('getMacOsApplicationPath extracts the app bundle path from the executable', async () => {
    const { getMacOsApplicationPath } = await import(moduleUrl)

    assert.equal(
        getMacOsApplicationPath('/tmp/vscode/Visual Studio Code.app/Contents/MacOS/Electron'),
        '/tmp/vscode/Visual Studio Code.app'
    )
    assert.equal(
        getMacOsApplicationPath('/tmp/vscode/code'),
        undefined
    )
})
