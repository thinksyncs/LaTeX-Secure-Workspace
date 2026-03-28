import * as vscode from 'vscode'
import * as path from 'path'
import * as sinon from 'sinon'
import { assert, mock, TextEditor, set } from './utils'
import { lw } from '../../src/lw'
import * as commands from '../../src/core/commands'

describe(path.basename(__filename).split('.')[0] + ':', () => {
    before(() => {
        mock.init(lw)
    })

    afterEach(() => {
        sinon.restore()
    })

    it('should convert outline line numbers to one-based SyncTeX positions', async () => {
        const filePath = '/tmp/main.tex'
        const editor = new TextEditor(filePath, 'a\nb\nc\nd\ne\nf\n', {})
        const toPDF = sinon.stub()

        lw.locate = {
            synctex: {
                toPDF,
            },
        } as unknown as typeof lw.locate

        set.config('view.outline.sync.viewer', true)
        sinon.stub(vscode.workspace, 'openTextDocument').resolves(editor.document)
        sinon.stub(vscode.window, 'showTextDocument').resolves(editor)
        sinon.stub(vscode.window, 'activeTextEditor').value(editor)
        const revealLine = sinon.stub(vscode.commands, 'executeCommand').resolves()

        await commands.gotoSection(filePath, 4)

        assert.ok(revealLine.calledOnceWithExactly('revealLine', { lineNumber: 4, at: 'center' }))
        assert.strictEqual(editor.selection.active.line, 4)
        assert.ok(toPDF.calledOnceWithExactly(undefined, { line: 5, filePath }))
    })
})
