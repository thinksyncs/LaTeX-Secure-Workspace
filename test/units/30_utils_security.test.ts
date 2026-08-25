import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { assert, hooks } from './utils'
import { confirmWorkspaceCommandExecution, getSecureConfigurationValue, getSecureConfigurationValueSync, requireTrustedWorkspace } from '../../src/utils/security'

describe('30_utils_security:', () => {
    beforeEach(() => {
        hooks.beforeEach()
    })

    afterEach(function (this: Mocha.Context) {
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

    it('should ignore workspace-scoped sync overrides in synchronous reads', () => {
        const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage')
        sinon.stub(vscode.workspace, 'getConfiguration').returns({
            inspect: sinon.stub().withArgs('docker.enabled').returns({
                defaultValue: false,
                globalValue: false,
                workspaceValue: true
            }),
            get: sinon.stub().withArgs('docker.enabled', sinon.match.any).returns(true)
        } as unknown as vscode.WorkspaceConfiguration)

        const value = getSecureConfigurationValueSync(undefined, 'docker.enabled', false)

        assert.strictEqual(value, false)
        assert.ok(showWarningStub.notCalled)
    })

    it('should not let a workspace enable local pdfLaTeX compatibility', () => {
        sinon.stub(vscode.workspace, 'getConfiguration').returns({
            inspect: sinon.stub().withArgs('security.allowLocalPdfLaTeX').returns({
                defaultValue: false,
                globalValue: false,
                workspaceValue: true
            }),
            get: sinon.stub().withArgs('security.allowLocalPdfLaTeX', sinon.match.any).returns(true)
        } as unknown as vscode.WorkspaceConfiguration)

        const value = getSecureConfigurationValueSync(undefined, 'security.allowLocalPdfLaTeX', false)

        assert.strictEqual(value, false)
    })

    it('should ignore language-specific workspace overrides and keep the user language value', async () => {
        const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined)
        sinon.stub(vscode.workspace, 'getConfiguration').returns({
            inspect: sinon.stub().withArgs('formatting.tex-fmt.args').returns({
                defaultValue: ['--default'],
                globalValue: ['--global'],
                defaultLanguageValue: ['--language-default'],
                globalLanguageValue: ['--language-user'],
                workspaceLanguageValue: ['--workspace-language']
            }),
            get: sinon.stub().withArgs('formatting.tex-fmt.args', sinon.match.any).returns(['--workspace-language'])
        } as unknown as vscode.WorkspaceConfiguration)

        const value = await getSecureConfigurationValue(undefined, 'formatting.tex-fmt.args', [] as string[])

        assert.deepStrictEqual(value, ['--language-user'])
        assert.ok(showWarningStub.calledOnce)
        assert.ok(String(showWarningStub.firstCall.args[0]).includes('language-specific workspace'))
    })

    it('should block workspace-scoped commands instead of approving them', async () => {
        const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined)
        sinon.stub(vscode.workspace, 'getConfiguration').returns({
            inspect: sinon.stub().withArgs('texdoc.path').returns({
                workspaceValue: '/tmp/evil'
            }),
            get: sinon.stub().withArgs('texdoc.path').returns('/tmp/evil')
        } as unknown as vscode.WorkspaceConfiguration)

        const approved = await confirmWorkspaceCommandExecution(undefined, 'texdoc.path', '/tmp/evil')

        assert.strictEqual(approved, false)
        assert.ok(showWarningStub.calledOnce)
    })

    it('should block language-specific workspace commands and identify the configured command', async () => {
        const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined)
        sinon.stub(vscode.workspace, 'getConfiguration').returns({
            inspect: sinon.stub().withArgs('synctex.path').returns({
                globalValue: 'synctex',
                workspaceLanguageValue: '/tmp/language-specific-synctex'
            }),
            get: sinon.stub()
        } as unknown as vscode.WorkspaceConfiguration)

        const approved = await confirmWorkspaceCommandExecution(undefined, 'synctex.path', 'synctex')

        assert.strictEqual(approved, false)
        assert.ok(String(showWarningStub.firstCall.args[0]).includes('/tmp/language-specific-synctex'))
    })

    it('should still block workspace-scoped commands during CI tests', async () => {
        const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage')
        sinon.stub(vscode.workspace, 'getConfiguration').returns({
            inspect: sinon.stub().withArgs('formatting.latexindent.path').returns({
                workspaceValue: process.execPath
            }),
            get: sinon.stub().withArgs('formatting.latexindent.path').returns(process.execPath)
        } as unknown as vscode.WorkspaceConfiguration)

        const approved = await confirmWorkspaceCommandExecution(undefined, 'formatting.latexindent.path', process.execPath)

        assert.strictEqual(approved, false)
        assert.ok(showWarningStub.calledOnce)
    })

    it('should require trust before an external feature is used', () => {
        sinon.stub(vscode.workspace, 'isTrusted').value(false)
        const showWarningStub = sinon.stub(vscode.window, 'showWarningMessage')

        assert.strictEqual(requireTrustedWorkspace('Security helper test'), false)
        assert.ok(showWarningStub.calledOnce)
    })
})
