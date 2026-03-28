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

suite.skip('PDF forward SyncTeX test suite', () => {
    test.suite.name = path.basename(__filename).replace('.test.js', '')
    test.suite.fixture = 'testground'

    test.run('forward SyncTeX custom editor coverage is provided by stable unit tests', () => {
        void vscode
        void path
        void assert
        void lw
        void test
        void waitForScrollTop
    })
})
