import * as path from 'path'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { assert, mock } from './utils'
import { lw } from '../../src/lw'
import * as customEditor from '../../src/preview/pdfcustomeditor'
import { configureSecurePdfViewerWebview } from '../../src/preview/viewer/securepdfviewer'
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
        synctex.components.setSynctexToPDFCombinedForTest(undefined)
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

    it('should use the bundled SyncTeX parser in restricted mode', () => {
        sinon.stub(vscode.workspace, 'isTrusted').value(false)

        assert.strictEqual(synctex.components.shouldUseNativeSyncTeX(), false)
    })

    it('should deliver forward SyncTeX records to the internal viewer', async () => {
        const rootFile = '/tmp/main.tex'
        const pdfUri = vscode.Uri.file('/tmp/.lw-security/main.pdf')
        const record = { page: 1, x: 12, y: 34, indicator: true }
        lw.root.file.path = rootFile
        lw.root.file.langId = 'latex'
        mock.activeTextEditor(rootFile, '\\documentclass{article}\n\\begin{document}\nabc\n\\end{document}\n')
        const locateStub = sinon.stub(lw.viewer, 'locate').resolves()
        synctex.components.setSynctexToPDFCombinedForTest(() => Promise.resolve(record))

        await synctex.toPDF(pdfUri, { line: 1, filePath: rootFile })

        assert.ok(locateStub.calledOnceWithExactly(pdfUri, record))
    })

    it('should target the fixed secure output directory by default', async () => {
        const rootFile = '/tmp/main.tex'
        const record = { page: 1, x: 12, y: 34, indicator: true }
        lw.root.file.path = rootFile
        lw.root.file.langId = 'latex'
        mock.activeTextEditor(rootFile, '\\documentclass{article}\n\\begin{document}\nabc\n\\end{document}\n')
        const locateStub = sinon.stub(lw.viewer, 'locate').resolves()
        synctex.components.setSynctexToPDFCombinedForTest(() => Promise.resolve(record))

        await synctex.toPDF(undefined, { line: 1, filePath: rootFile })

        assert.strictEqual(locateStub.callCount, 1)
        const [actualPdfUri, actualRecord] = locateStub.firstCall.args as [vscode.Uri, typeof record]
        assert.pathStrictEqual(actualPdfUri.fsPath, lw.file.getSecurityPdfPath(rootFile))
        assert.deepStrictEqual(actualRecord, record)
    })

    it('should restrict reverse SyncTeX targets to the PDF workspace', async () => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
        assert.ok(workspaceFolder)
        const pdfUri = vscode.Uri.file(path.join(workspaceFolder.uri.fsPath, '.lw-security', 'main.pdf'))
        const insideFile = path.join(workspaceFolder.uri.fsPath, '04_core_root', 'secure_parent', 'main.tex')
        const outsideFile = path.join(lw.extensionRoot, 'package.json')

        assert.strictEqual(await synctex.components.isReverseSyncTeXTargetAllowed(insideFile, pdfUri), true)
        assert.strictEqual(await synctex.components.isReverseSyncTeXTargetAllowed(outsideFile, pdfUri), false)
    })

    it('should expose only extension assets and the PDF directory to the webview', () => {
        const pdfUri = vscode.Uri.file('/tmp/.lw-security/main.pdf')
        const webview = { options: {} } as unknown as vscode.Webview

        configureSecurePdfViewerWebview(webview, pdfUri)

        assert.strictEqual(webview.options.enableScripts, true)
        const roots = webview.options.localResourceRoots ?? []
        assert.strictEqual(roots.length, 2)
        assert.pathStrictEqual(roots[0].fsPath, lw.extensionRoot)
        assert.pathStrictEqual(roots[1].fsPath, path.dirname(pdfUri.fsPath))
    })
})
