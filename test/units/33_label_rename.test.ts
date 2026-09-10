import * as vscode from 'vscode'
import * as sinon from 'sinon'
import { LabelRenameProvider, labelRenameComponents } from '../../src/language/label-rename'
import { assert, mock, set } from './utils'
import { testFileSuiteName } from '../file-name'

describe(testFileSuiteName(__filename), () => {
    beforeEach(() => {
        mock.config()
    })

    afterEach(() => {
        sinon.restore()
    })

    it('should rename argument text without changing command names', () => {
        for (const label of ['a', 'label', 'ref']) {
            const content = '\\label{' + label + '} See \\ref{' + label + '}.'
            let renamed = content
            const matches = labelRenameComponents.collectLabelMatches(content, label)
            assert.strictEqual(matches.length, 2)
            for (const match of [...matches].reverse()) {
                renamed = renamed.slice(0, match.start) + 'renamed' + renamed.slice(match.end)
            }
            assert.strictEqual(renamed, '\\label{renamed} See \\ref{renamed}.')
        }
    })

    it('should preserve offsets after comments, inline verbatim, and code blocks', () => {
        set.config('latex.verbatimEnvs', ['verbatim', 'lstlisting', 'minted', 'code.sample'])
        const ignored = [
            '% 😀 \\label{sample}',
            '\\verb|% \\ref{sample}|',
            '\\verb*+\\label{sample}+',
            '\\begin{verbatim}\\label{sample}\\end{verbatim}',
            '\\begin{Verbatim*}\r\n\\ref{sample}\r\n\\end{Verbatim*}',
            '\\begin{lstlisting}\\label{sample}\\end{lstlisting}',
            '\\begin{minted}{tex}\\ref{sample}\\end{minted}',
            '\\begin{code.sample}\\ref{sample}\\end{code.sample}'
        ].join('\r\n')
        const content = ignored + '\r\n\\label{sample} \\ref{sample}'
        const matches = labelRenameComponents.collectLabelMatches(content, 'sample')
        assert.strictEqual(matches.length, 2)
        assert.ok(matches.every(match => match.start > ignored.length))
        assert.ok(matches.every(match => content.slice(match.start, match.end) === 'sample'))
        assert.strictEqual(labelRenameComponents.findLabelAtOffset(content, content.indexOf('sample')), undefined)
    })

    it('should respect escaped percent signs and ignore unfinished verbatim blocks', () => {
        const content = '\\% \\label{active}\n\\\\% \\label{comment}\n\\begin{verbatim}\n\\label{unfinished}'
        assert.strictEqual(labelRenameComponents.collectLabelMatches(content, 'active').length, 1)
        assert.strictEqual(labelRenameComponents.collectLabelMatches(content, 'comment').length, 0)
        assert.strictEqual(labelRenameComponents.collectLabelMatches(content, 'unfinished').length, 0)
        assert.deepStrictEqual(labelRenameComponents.collectLabelMatches('\\\\label{literal}', 'literal'), [])
    })

    it('should prepare rename on the argument even when it matches the command name', async () => {
        const content = '\\label{label}'
        const document = await vscode.workspace.openTextDocument({ language: 'latex', content })
        const prepared = new LabelRenameProvider().prepareRename(document, document.positionAt(content.lastIndexOf('label') + 2))
        assert.ok(prepared && 'placeholder' in prepared)
        assert.strictEqual(document.getText(prepared.range), 'label')
        assert.strictEqual(document.offsetAt(prepared.range.start), 7)
    })

    it('should identify labels under the cursor', () => {
        const content = '\\section{A}\\label{sec:a}\nSee \\ref{sec:a}.'
        const offset = content.indexOf('sec:a') + 2

        assert.deepStrictEqual(labelRenameComponents.findLabelAtOffset(content, offset), {
            start: content.indexOf('sec:a'),
            end: content.indexOf('sec:a') + 5,
            value: 'sec:a'
        })
    })

    it('should identify one label inside a multi-reference command', () => {
        const content = '\\cref{sec:a, sec:b}'
        const offset = content.indexOf('sec:b') + 2

        assert.deepStrictEqual(labelRenameComponents.findLabelAtOffset(content, offset), {
            start: content.indexOf('sec:b'),
            end: content.indexOf('sec:b') + 5,
            value: 'sec:b'
        })
    })

    it('should collect exact label uses without changing similar labels', () => {
        const content = '\\label{sec:a}\\ref{sec:a}\\cref{sec:a,sec:ab}'
        const matches = labelRenameComponents.collectLabelMatches(content, 'sec:a')

        assert.strictEqual(matches.length, 3)
        assert.ok(matches.every(match => content.slice(match.start, match.end) === 'sec:a'))
    })

    it('should reject unsafe label names', () => {
        assert.strictEqual(labelRenameComponents.isValidLabel('sec:result-1'), true)
        assert.strictEqual(labelRenameComponents.isValidLabel('sec result'), false)
        assert.strictEqual(labelRenameComponents.isValidLabel('sec:a,sec:b'), false)
        assert.strictEqual(labelRenameComponents.isValidLabel('{sec:a}'), false)
    })
})
