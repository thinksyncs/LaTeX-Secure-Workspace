const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { loadTsModule } = require('./loadTsModule.cjs')

const runTestModule = loadTsModule(path.resolve(__dirname, '../runTest.ts'))

test('shouldBackgroundMacOsTestHost only enables background launch on local macOS by default', () => {
    const { shouldBackgroundMacOsTestHost } = runTestModule

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

test('getMacOsApplicationPath extracts the app bundle path from the executable', () => {
    const { getMacOsApplicationPath } = runTestModule

    assert.equal(
        getMacOsApplicationPath('/tmp/vscode/Visual Studio Code.app/Contents/MacOS/Electron'),
        '/tmp/vscode/Visual Studio Code.app'
    )
    assert.equal(
        getMacOsApplicationPath('/tmp/vscode/code'),
        undefined
    )
})
