import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { lw } from '../../src/lw'
import { assert, get, mock } from './utils'
import { provider } from '../../src/completion/completer/class'
import { testFileStem, testFileSuiteName } from '../file-name'

describe(testFileSuiteName(__filename), () => {
    const fixture = testFileStem(__filename)
    const texPath = get.path(fixture, 'main.tex')

    before(() => {
        mock.init(lw, 'root', 'cache', 'parser', 'completion')
    })

    after(() => {
        sinon.restore()
    })

    describe('lw.completion->documentclass', () => {
        function getSuggestions() {
            return provider.from(['', ''], {
                uri: vscode.Uri.file(texPath),
                langId: 'latex',
                line: '',
                position: new vscode.Position(0, 0),
            })
        }

        function getClasses() {
            return getSuggestions().map((s) => s.label)
        }

        it('should provide \\documentclass suggestions', () => {
            const labels = getClasses()

            assert.ok(labels.includes('article'))
        })
    })
})
