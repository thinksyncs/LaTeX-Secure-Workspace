import * as vscode from 'vscode'
import * as path from 'path'
import * as assert from 'assert'
import { lw } from '../../src/lw'
import * as test from './utils'

async function waitForScrollTop(pdfUri: vscode.Uri, minimumScrollTop: number, timeoutMs = 8000) {
    const startedAt = Date.now()
    while (Date.now() - startedAt < timeoutMs) {
        const scrollTop = lw.viewer.getViewerState(pdfUri)[0]?.scrollTop ?? 0
        if (scrollTop > minimumScrollTop) {
            return scrollTop
        }
        await test.sleep(100)
    }
    return lw.viewer.getViewerState(pdfUri)[0]?.scrollTop ?? 0
}

suite('PDF forward SyncTeX test suite', function() {
    this.timeout(30000)
    test.suite.name = path.basename(__filename).replace('.test.js', '')
    test.suite.fixture = 'testground'

    suiteSetup(async () => {
        await test.activateExtension()
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.autoBuild.run', 'never')
        await vscode.workspace.getConfiguration('latex-workshop').update('view.pdf.viewer', 'tab')
    })

    teardown(async () => {
        await test.reset()
        await vscode.workspace.getConfiguration().update('latex-workshop.latex.outDir', undefined)
        await vscode.workspace.getConfiguration().update('latex-workshop.latex.rootFile.useSubFile', undefined)
        await vscode.workspace.getConfiguration().update('latex-workshop.latex.rootFile.doNotPrompt', undefined)
        await vscode.workspace.getConfiguration().update('latex-workshop.synctex.afterBuild.enabled', undefined)
    })

    test.run('forward SyncTeX scrolls the custom editor tab', async (fixture: string) => {
        await test.load(fixture, [
            {src: 'viewer_synctex_forward.tex', dst: 'main.tex'}
        ], {open: 0, skipCache: true})

        await test.build(fixture, 'main.tex')
        await test.view(fixture, 'main.pdf')

        const pdfUri = vscode.Uri.file(path.resolve(fixture, 'main.pdf'))
        await vscode.commands.executeCommand('workbench.action.focusLeftGroup')
        await test.open(path.resolve(fixture, 'main.tex'))

        const activeTextEditor = vscode.window.activeTextEditor
        assert.ok(activeTextEditor)

        const targetPosition = new vscode.Position(8, 0)
        activeTextEditor.selection = new vscode.Selection(targetPosition, targetPosition)
        activeTextEditor.revealRange(new vscode.Range(targetPosition, targetPosition))

        const initialScrollTop = lw.viewer.getViewerState(pdfUri)[0]?.scrollTop ?? 0
        await vscode.commands.executeCommand('latex-workshop.synctex')

        const scrolledTop = await waitForScrollTop(pdfUri, initialScrollTop + 25)
        assert.ok(scrolledTop > initialScrollTop + 25, `Expected PDF tab scrollTop to increase, got ${initialScrollTop} -> ${scrolledTop}`)
    }, ['linux', 'darwin'])
})
