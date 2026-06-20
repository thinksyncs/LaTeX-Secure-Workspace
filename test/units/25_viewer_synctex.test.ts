import * as vscode from 'vscode'
import * as sinon from 'sinon'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { assert, mock, sleep } from './utils'
import { lw } from '../../src/lw'
import * as customEditor from '../../src/preview/pdfcustomeditor'
import { synctex } from '../../src/locate/synctex'
import { testFileSuiteName } from '../file-name'

describe(testFileSuiteName(__filename), () => {
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
        const stat = sinon.stub(lw.external, 'stat').resolves({type: vscode.FileType.File, ctime: 0, mtime: 0, size: 1})

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
        const stat = sinon.stub(lw.external, 'stat').rejects(new Error('missing'))

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

    it('should deliver forward SyncTeX records to the internal viewer', async () => {
        const rootFile = '/tmp/main.tex'
        const pdfUri = vscode.Uri.file('/tmp/.lw-security/main.pdf')
        const oldPath = process.env.PATH
        const binDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-synctex-'))
        const commandName = process.platform === 'win32' ? 'synctex.cmd' : 'synctex'
        const commandPath = path.join(binDir, commandName)
        const command = process.platform === 'win32'
            ? '@echo off\r\necho SyncTeX result begin\r\necho Page:1\r\necho x:12\r\necho y:34\r\necho SyncTeX result end\r\n'
            : '#!/bin/sh\necho "SyncTeX result begin"\necho "Page:1"\necho "x:12"\necho "y:34"\necho "SyncTeX result end"\n'
        fs.writeFileSync(commandPath, command)
        if (process.platform !== 'win32') {
            fs.chmodSync(commandPath, 0o755)
        }
        process.env.PATH = `${binDir}${path.delimiter}${oldPath ?? ''}`
        lw.root.file.path = rootFile
        lw.root.file.langId = 'latex'
        mock.activeTextEditor(rootFile, '\\documentclass{article}\n\\begin{document}\nabc\n\\end{document}\n')
        const locateStub = sinon.stub(lw.viewer, 'locate').resolves()
        try {
            synctex.toPDF(pdfUri, { line: 1, filePath: rootFile })

            for (let retry = 0; retry < 20 && locateStub.notCalled; retry++) {
                await sleep(10)
            }
            assert.ok(locateStub.calledOnceWithExactly(pdfUri, {
                page: 1,
                x: 12,
                y: 34,
                indicator: true
            }))
        } finally {
            process.env.PATH = oldPath
            fs.rmSync(binDir, { recursive: true, force: true })
        }
    })
})
