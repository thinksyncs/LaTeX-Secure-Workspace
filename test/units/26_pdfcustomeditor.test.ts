import * as path from 'path'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { assert, get } from './utils'
import { components, getCustomEditorStates, revealLocationInCustomEditor } from '../../src/preview/pdfcustomeditor'

describe(path.basename(__filename).split('.')[0] + ':', () => {
    const pdfUri = vscode.Uri.file(get.path('main.pdf'))
    const record = { page: 2, x: 10, y: 20, h: 0, v: 0, W: 0, H: 0, indicator: true }

    beforeEach(() => {
        components.viewerStates.clear()
        components.pendingSyncTeX.clear()
    })

    afterEach(() => {
        components.viewerStates.clear()
        components.pendingSyncTeX.clear()
        sinon.restore()
    })

    it('should return false when no custom editor panel is open', async () => {
        const result = await revealLocationInCustomEditor(pdfUri, record)

        assert.strictEqual(result, false)
        assert.deepStrictEqual(getCustomEditorStates(pdfUri), [])
        assert.strictEqual(components.pendingSyncTeX.get(pdfUri.toString(true)), record)
    })

    it('should post SyncTeX to registered custom editor panels', async () => {
        const postMessage = sinon.stub().resolves(true)
        const reveal = sinon.stub()
        const panel = {
            viewColumn: vscode.ViewColumn.Beside,
            reveal,
            webview: { postMessage }
        } as unknown as vscode.WebviewPanel
        const state = { path: pdfUri.fsPath, pdfFileUri: pdfUri.toString(true), scrollTop: 0 }

        components.updateViewerState(pdfUri, panel, state)

        const result = await revealLocationInCustomEditor(pdfUri, record)

        assert.strictEqual(result, true)
        assert.ok(reveal.calledOnceWithExactly(vscode.ViewColumn.Beside, true))
        assert.ok(postMessage.calledOnceWithExactly({ type: 'synctex', data: record }))
        assert.deepStrictEqual(getCustomEditorStates(pdfUri), [state])
        assert.strictEqual(components.pendingSyncTeX.has(pdfUri.toString(true)), false)
    })

    it('should deliver queued SyncTeX once a panel becomes available', async () => {
        const postMessage = sinon.stub().resolves(true)
        const panel = {
            viewColumn: vscode.ViewColumn.Beside,
            reveal: sinon.stub(),
            webview: { postMessage }
        } as unknown as vscode.WebviewPanel

        await revealLocationInCustomEditor(pdfUri, record)
        components.updateViewerState(pdfUri, panel, { path: pdfUri.fsPath, pdfFileUri: pdfUri.toString(true) })

        await components.deliverPendingSyncTeX(pdfUri, panel)

        assert.ok(postMessage.calledOnceWithExactly({ type: 'synctex', data: record }))
        assert.strictEqual(components.pendingSyncTeX.has(pdfUri.toString(true)), false)
    })
})
