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
        const currentToPDF = lw.locate.synctex.toPDF as sinon.SinonStub
        const toPDFStub = typeof currentToPDF.resolves === 'function'
            ? currentToPDF
            : sinon.stub(lw.locate.synctex, 'toPDF')
        toPDFStub.resetHistory()
        toPDFStub.resolves()

        await commands.build()

        assert.ok(buildStub.calledOnceWithExactly(false, undefined, undefined, undefined))
        assert.strictEqual(toPDFStub.callCount, 1)
        const [pdfUri, source] = toPDFStub.firstCall.args as [vscode.Uri, {line: number, filePath: string}]
        assert.pathStrictEqual(pdfUri.fsPath, lw.file.getSecurityPdfPath(rootFile))
        assert.deepStrictEqual(source, { line: 2, filePath: sourceFile })
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

    it('should add a TeX root from a LaTeX editor', () => {
        mock.activeTextEditor(get.path('main.tex'), '', { languageId: 'latex' })
        const texrootStub = sinon.stub(lw.extra, 'texroot')

        commands.addTexRoot()

        assert.ok(texrootStub.calledOnce)
    })

    it('should add a TeX root from a LaTeX package editor', () => {
        mock.activeTextEditor(get.path('package.sty'), '', { languageId: 'latex-package' })
        const texrootStub = sinon.stub(lw.extra, 'texroot')

        commands.addTexRoot()

        assert.ok(texrootStub.calledOnce)
    })

    it('should not add a TeX root from an unrelated editor', () => {
        mock.activeTextEditor(get.path('notes.txt'), '', { languageId: 'plaintext' })
        const texrootStub = sinon.stub(lw.extra, 'texroot')

        commands.addTexRoot()

        assert.ok(texrootStub.notCalled)
        assert.hasLog('Cannot add tex root.')
    })

    it('should view the newly resolved root instead of a stale compiled PDF', async () => {
        const oldRoot = get.path('project-a', 'main.tex')
        const newRoot = get.path('project-b', 'main.tex')
        const stalePdf = lw.file.getSecurityPdfPath(oldRoot)
        const currentPdf = lw.file.getSecurityPdfPath(newRoot)
        lw.compile.compiledPDFPath = stalePdf
        lw.root.file.path = oldRoot

        const currentResolve = lw.root.resolveSecurityRoot as sinon.SinonStub
        const resolveRootStub = typeof currentResolve.callsFake === 'function'
            ? currentResolve
            : sinon.stub(lw.root, 'resolveSecurityRoot')
        resolveRootStub.resetHistory()
        resolveRootStub.callsFake(() => {
            lw.root.file.path = newRoot
            return Promise.resolve(newRoot)
        })
        const pdfStat: vscode.FileStat = { type: vscode.FileType.File, ctime: 0, mtime: 0, size: 1 }
        const existsStub = sinon.stub(lw.file, 'exists').callsFake(candidate => {
            const filePath = candidate instanceof vscode.Uri ? candidate.fsPath : candidate
            return Promise.resolve(filePath === stalePdf || filePath === currentPdf ? pdfStat : false)
        })
        const currentView = lw.viewer.view as sinon.SinonStub
        const viewStub = typeof currentView.resolves === 'function'
            ? currentView
            : sinon.stub(lw.viewer, 'view')
        viewStub.resetHistory()
        viewStub.resolves()

        try {
            await commands.view()
        } finally {
            lw.compile.compiledPDFPath = ''
        }

        assert.ok(existsStub.calledOnceWithExactly(currentPdf))
        assert.ok(viewStub.calledOnce)
        const [viewedPdf] = viewStub.firstCall.args as [vscode.Uri]
        assert.pathStrictEqual(viewedPdf.fsPath, currentPdf)
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
