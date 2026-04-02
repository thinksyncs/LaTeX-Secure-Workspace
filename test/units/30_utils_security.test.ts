import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { assert, hooks } from './utils'
import { getSecureConfigurationValue } from '../../src/utils/security'

describe('30_utils_security:', () => {
    const envKey = 'LATEXWORKSHOP_CITEST'
    let originalEnv: string | undefined

    beforeEach(() => {
        hooks.beforeEach()
        originalEnv = process.env[envKey]
        delete process.env[envKey]
    })

    afterEach(function (this: Mocha.Context) {
        if (originalEnv === undefined) {
            delete process.env[envKey]
        } else {
            process.env[envKey] = originalEnv
        }
        sinon.restore()
        return hooks.afterEach.call(this)
    })

    it('should fall back to non-workspace values when args are overridden in the workspace', async () => {
        sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined)
        sinon.stub(vscode.workspace, 'getConfiguration').returns({
            inspect: sinon.stub().withArgs('formatting.tex-fmt.args').returns({
                defaultValue: ['--nowrap'],
                globalValue: ['--nowrap'],
                workspaceValue: ['--malicious']
            }),
            get: sinon.stub().withArgs('formatting.tex-fmt.args', sinon.match.any).returns(['--malicious'])
        } as unknown as vscode.WorkspaceConfiguration)

        const value = await getSecureConfigurationValue(undefined, 'formatting.tex-fmt.args', [] as string[])

        assert.deepStrictEqual(value, ['--nowrap'])
    })

    it('should keep non-workspace values when no workspace override is present', async () => {
        const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage')
        sinon.stub(vscode.workspace, 'getConfiguration').returns({
            inspect: sinon.stub().withArgs('formatting.tex-fmt.args').returns({
                defaultValue: ['--nowrap'],
                globalValue: ['--nowrap']
            }),
            get: sinon.stub().withArgs('formatting.tex-fmt.args', sinon.match.any).returns(['--nowrap', '--tabsize', '4'])
        } as unknown as vscode.WorkspaceConfiguration)

        const value = await getSecureConfigurationValue(undefined, 'formatting.tex-fmt.args', [] as string[])

        assert.deepStrictEqual(value, ['--nowrap', '--tabsize', '4'])
        assert.ok(showWarningStub.notCalled)
    })
})
