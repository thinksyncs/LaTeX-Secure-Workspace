import * as vscode from 'vscode'
import * as path from 'path'
import * as sinon from 'sinon'
import { assert, mock } from './utils'
import { lw } from '../../src/lw'
import * as commands from '../../src/core/commands'

describe(path.basename(__filename).split('.')[0] + ':', () => {
    before(() => {
        mock.init(lw)
    })

    afterEach(() => {
        sinon.restore()
    })

    it('should forward an explicit secure recipe name to build', async () => {
        const buildStub = sinon.stub(lw.compile, 'build').resolves()

        await commands.recipes('secure-latexmk')

        assert.ok(buildStub.calledOnceWithExactly(false, undefined, undefined, 'secure-latexmk'))
    })

    it('should build the secure recipe selected from quick pick', async () => {
        const buildStub = sinon.stub(lw.compile, 'build').resolves()
        sinon.stub(vscode.window, 'showQuickPick').resolves('secure-latexmk' as unknown as vscode.QuickPickItem)

        await commands.buildRecipe()

        assert.ok(buildStub.calledOnceWithExactly(false, undefined, undefined, 'secure-latexmk'))
    })

    it('should delegate texdoc to the extras module', async () => {
        const texdocStub = sinon.stub().resolves()
        lw.extra = {
            ...lw.extra,
            texdoc: texdocStub,
        } as typeof lw.extra

        commands.texdoc('amsmath')
        commands.texdocUsepackages()

        assert.ok(texdocStub.firstCall.calledWithExactly('amsmath'))
        assert.ok(texdocStub.secondCall.calledWithExactly(undefined, true))
    })
})
