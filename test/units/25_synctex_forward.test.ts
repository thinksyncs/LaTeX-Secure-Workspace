import * as path from 'path'
import * as sinon from 'sinon'
import { assert, get, mock } from './utils'
import { lw } from '../../src/lw'
import { synctex } from '../../src/locate/synctex'
import * as commands from '../../src/core/commands'

describe(path.basename(__filename).split('.')[0] + ':', () => {
    afterEach(() => {
        sinon.restore()
    })

    describe('lw.locate->synctex', () => {
        it('should keep forward SyncTeX in the internal viewer when tab mode is enabled', () => {
            assert.strictEqual(synctex.components.shouldUseExternalViewerForForwardSyncTeX('auto', 'tab'), false)
        })

        it('should still use the external path when explicitly requested', () => {
            assert.strictEqual(synctex.components.shouldUseExternalViewerForForwardSyncTeX('external', 'tab'), true)
            assert.strictEqual(synctex.components.shouldUseExternalViewerForForwardSyncTeX('tabOrBrowser', 'tab'), true)
            assert.strictEqual(synctex.components.shouldUseExternalViewerForForwardSyncTeX('auto', 'external'), true)
        })
    })

    describe('lw.commands->synctex', () => {
        it('should delegate to lw.locate.synctex.toPDF for a LaTeX editor', () => {
            mock.activeTextEditor(get.path('main.tex'), '\\n', {languageId: 'latex'})
            sinon.stub(lw.file, 'hasLaTeXLangId').returns(true)
            const toPdfStub = sinon.stub(lw.locate.synctex, 'toPDF')

            commands.synctex()

            assert.ok(toPdfStub.calledOnce)
        })

        it('should do nothing for non-LaTeX editors', () => {
            mock.activeTextEditor(get.path('main.md'), '# note', {languageId: 'markdown'})
            const toPdfStub = sinon.stub(lw.locate.synctex, 'toPDF')
            sinon.stub(lw.file, 'hasLaTeXLangId').returns(false)

            commands.synctex()

            assert.ok(toPdfStub.notCalled)
        })
    })
})
