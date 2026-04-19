import * as vscode from 'vscode'
import * as path from 'path'
import * as sinon from 'sinon'
import { assert, mock } from './utils'
import { lw } from '../../src/lw'
import * as customEditor from '../../src/preview/pdfcustomeditor'
import { synctex } from '../../src/locate/synctex'

describe(path.basename(__filename).split('.')[0] + ':', () => {
    before(() => {
        mock.init(lw)
    })

    beforeEach(() => {
        customEditor.resetCustomEditorStateForTest()
    })

    afterEach(() => {
        sinon.restore()
        customEditor.resetCustomEditorStateForTest()
    })

    it('should post SyncTeX immediately to an open custom editor', async () => {
        const pdfUri = vscode.Uri.file('/tmp/main.pdf')
        const reveal = sinon.stub()
        const postMessage = sinon.stub().resolves(true)
        const panel = {
            reveal,
            webview: {
                postMessage,
            },
        } as unknown as vscode.WebviewPanel
        const record = { page: 1, x: 12, y: 34, indicator: true }

        customEditor.registerCustomEditorPanelForTest(pdfUri, panel, { pdfFileUri: pdfUri.toString(true) })
        const revealed = await customEditor.revealLocationInCustomEditor(pdfUri, record)

        assert.strictEqual(revealed, true)
        assert.ok(reveal.calledOnce)
        assert.ok(postMessage.calledOnceWithExactly({
            type: 'synctex',
            data: record
        }))
    })

    it('should keep SyncTeX pending until a custom editor is available', async () => {
        const pdfUri = vscode.Uri.file('/tmp/main.pdf')
        const postMessage = sinon.stub().resolves(true)
        const panel = {
            reveal: sinon.stub(),
            webview: {
                postMessage,
            },
        } as unknown as vscode.WebviewPanel
        const record = { page: 2, x: 20, y: 40, indicator: true }

        const revealed = await customEditor.revealLocationInCustomEditor(pdfUri, record)
        assert.strictEqual(revealed, false)

        customEditor.registerCustomEditorPanelForTest(pdfUri, panel, { pdfFileUri: pdfUri.toString(true) })
        const delivered = await customEditor.deliverPendingSyncTeXForTest(pdfUri, panel)

        assert.strictEqual(delivered, true)
        assert.ok(postMessage.calledOnceWithExactly({
            type: 'synctex',
            data: record
        }))
    })

    it('should route reverse SyncTeX messages to the locator', async () => {
        const pdfUri = vscode.Uri.file('/tmp/main.pdf')
        const panel = {
            webview: {
                postMessage: sinon.stub().resolves(true),
            },
        } as unknown as vscode.WebviewPanel
        const toTeX = sinon.stub().resolves()
        lw.locate = {
            synctex: {
                toTeX,
            },
        } as unknown as typeof lw.locate

        await customEditor.handleCustomEditorMessageForTest(pdfUri, panel, {}, {
            type: 'reverse_synctex',
            page: 2,
            pos: [12, 34],
            textBeforeSelection: '',
            textAfterSelection: ''
        })

        assert.ok(toTeX.calledOnceWithExactly({
            type: 'reverse_synctex',
            page: 2,
            pos: [12, 34],
            textBeforeSelection: '',
            textAfterSelection: ''
        }, pdfUri))
    })

    it('should keep the custom editor open when a deleted PDF reappears quickly', async () => {
        const clock = sinon.useFakeTimers()
        const pdfUri = vscode.Uri.file('/tmp/main.pdf')
        const dispose = sinon.stub()
        const postMessage = sinon.stub().resolves(true)
        const panel = {
            dispose,
            webview: {
                postMessage,
            },
        } as unknown as vscode.WebviewPanel
        const stat = sinon.stub(vscode.workspace.fs, 'stat').resolves({type: vscode.FileType.File, ctime: 0, mtime: 0, size: 1})

        await customEditor.schedulePanelDisposeAfterDeleteForTest(pdfUri, panel)
        await clock.tickAsync(300)

        assert.ok(stat.calledOnceWithExactly(pdfUri))
        assert.ok(dispose.notCalled)
        assert.ok(postMessage.calledOnceWithExactly({type: 'reload'}))
    })

    it('should dispose the custom editor when the deleted PDF stays missing', async () => {
        const clock = sinon.useFakeTimers()
        const pdfUri = vscode.Uri.file('/tmp/main.pdf')
        const dispose = sinon.stub()
        const postMessage = sinon.stub().resolves(true)
        const panel = {
            dispose,
            webview: {
                postMessage,
            },
        } as unknown as vscode.WebviewPanel
        const stat = sinon.stub(vscode.workspace.fs, 'stat').rejects(new Error('missing'))

        await customEditor.schedulePanelDisposeAfterDeleteForTest(pdfUri, panel)
        await clock.tickAsync(300)

        assert.ok(stat.calledOnceWithExactly(pdfUri))
        assert.ok(dispose.calledOnce)
        assert.ok(postMessage.notCalled)
    })

    it('should keep forward SyncTeX on the internal path in the secure build', () => {
        assert.strictEqual(synctex.components.shouldUseExternalViewerForForwardSyncTeX('auto', 'tab'), false)
        assert.strictEqual(synctex.components.shouldUseExternalViewerForForwardSyncTeX('auto', 'external'), false)
        assert.strictEqual(synctex.components.shouldUseExternalViewerForForwardSyncTeX('tabOrBrowser', 'tab'), false)
    })
})
