import { labelRenameComponents } from '../../src/language/label-rename'
import { assert } from './utils'
import { testFileSuiteName } from '../file-name'

describe(testFileSuiteName(__filename), () => {
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
