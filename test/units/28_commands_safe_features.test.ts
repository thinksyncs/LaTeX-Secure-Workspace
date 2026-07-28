import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { assert, get, mock, set } from './utils'
import { lw } from '../../src/lw'
import * as commands from '../../src/core/commands'
import { testFileSuiteName } from '../file-name'

describe(testFileSuiteName(__filename), () => {
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

    it('should reveal the active source location after a successful manual build', async () => {
        const rootFile = set.root('main.tex')
        const sourceFile = get.path('sections', 'intro.tex')
        mock.activeTextEditor(sourceFile, 'First line.\nSecond line.\n')
        const editor = vscode.window.activeTextEditor
        editor!.selection = new vscode.Selection(1, 0, 1, 0)
        const buildStub = sinon.stub(lw.compile, 'build').resolves(true)
        const pdfStat: vscode.FileStat = { type: vscode.FileType.File, ctime: 0, mtime: 0, size: 1 }
        sinon.stub(lw.file, 'exists').resolves(pdfStat)
        const toPDFStub = sinon.stub(lw.locate.synctex, 'toPDF').resolves()

        await commands.build()

        assert.ok(buildStub.calledOnceWithExactly(false, undefined, undefined, undefined))
        assert.ok(toPDFStub.calledOnceWithExactly(
            vscode.Uri.file(lw.file.getSecurityPdfPath(rootFile)),
            { line: 2, filePath: sourceFile }
        ))
    })

    it('should delegate texdoc to the extras module', () => {
        const texdocStub = sinon.stub().resolves()
        const extra: typeof lw.extra = {
            ...lw.extra,
            texdoc: texdocStub,
        }
        lw.extra = extra

        commands.texdoc('amsmath')
        commands.texdocUsepackages()

        assert.ok(texdocStub.firstCall.calledWithExactly('amsmath'))
        assert.ok(texdocStub.secondCall.calledWithExactly(undefined, true))
    })

    it('should keep math preview commands as disabled compatibility no-ops', () => {
        const warningStub = sinon.stub(vscode.window, 'showWarningMessage')

        commands.openMathPreviewPanel()
        commands.closeMathPreviewPanel()
        commands.toggleMathPreviewPanel()

        assert.strictEqual(warningStub.callCount, 3)
        assert.deepStrictEqual(warningStub.getCalls().map(call => call.args[0]), [
            'Math preview panel is disabled in this secure build.',
            'Math preview panel is disabled in this secure build.',
            'Math preview panel is disabled in this secure build.'
        ])
    })
})
