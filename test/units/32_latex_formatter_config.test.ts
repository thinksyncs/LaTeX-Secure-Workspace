import * as path from 'path'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { assert, mock, set, TextDocument, hooks } from './utils'
import { formatter as latexFormatter } from '../../src/lint/latex-formatter'
import * as quoteFixer from '../../src/extras/quote-fixer'
import * as mathFixer from '../../src/extras/math-fixer'

describe(path.basename(__filename).split('.')[0] + ':', () => {
    beforeEach(() => {
        hooks.beforeEach()
        mock.config()
    })

    afterEach(function (this: Mocha.Context) {
        sinon.restore()
        return hooks.afterEach.call(this)
    })

    it('should not show an error when no external LaTeX formatter is configured', async () => {
        const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage')
        sinon.stub(quoteFixer, 'fixQuotes').returns([])
        sinon.stub(mathFixer, 'fixMath').returns([])
        set.config('formatting.latex', 'none')
        set.config('message.error.show', true)
        const document = new TextDocument('/tmp/main.tex', 'Plain text', {})
        const formattingOptions: vscode.FormattingOptions = { insertSpaces: true, tabSize: 4 }
        const token = new vscode.CancellationTokenSource().token

        const edits = await latexFormatter.provideDocumentFormattingEdits(document, formattingOptions, token)

        assert.deepStrictEqual(edits, [])
        assert.ok(showErrorStub.notCalled)
    })

    it('should still report an unknown formatter value', async () => {
        const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage')
        sinon.stub(quoteFixer, 'fixQuotes').returns([])
        sinon.stub(mathFixer, 'fixMath').returns([])
        set.config('formatting.latex', 'broken-formatter')
        set.config('message.error.show', true)
        const document = new TextDocument('/tmp/main.tex', 'Plain text', {})
        const formattingOptions: vscode.FormattingOptions = { insertSpaces: true, tabSize: 4 }
        const token = new vscode.CancellationTokenSource().token

        const edits = await latexFormatter.provideDocumentFormattingEdits(document, formattingOptions, token)

        assert.deepStrictEqual(edits, [])
        assert.strictEqual(showErrorStub.firstCall?.args[0], 'Unknown LaTeX formatter by `formatting.latex`: broken-formatter .')
    })
})
