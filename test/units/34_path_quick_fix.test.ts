import * as path from 'path'

import { pathQuickFixComponents } from '../../src/language/path-quick-fix'
import { assert } from './utils'
import { testFileSuiteName } from '../file-name'

describe(testFileSuiteName(__filename), () => {
    it('should identify supported missing-path arguments', () => {
        const content = [
            '\\input{sections/missing}',
            '\\includegraphics[width=2cm]{figures/chart}',
            '\\addbibresource{references/library.bib}'
        ].join('\n')
        const references = pathQuickFixComponents.findPathReferences(content)

        assert.deepStrictEqual(references.map(reference => ({ kind: reference.kind, value: reference.value })), [
            { kind: 'tex', value: 'sections/missing' },
            { kind: 'image', value: 'figures/chart' },
            { kind: 'bib', value: 'references/library.bib' }
        ])
    })

    it('should ignore commands inside comments', () => {
        assert.deepStrictEqual(pathQuickFixComponents.findPathReferences('% \\input{missing}'), [])
    })

    it('should reject absolute, dynamic, and multi-value paths', () => {
        assert.strictEqual(pathQuickFixComponents.isStaticProjectPath('sections/intro'), true)
        assert.strictEqual(pathQuickFixComponents.isStaticProjectPath('/tmp/intro.tex'), false)
        assert.strictEqual(pathQuickFixComponents.isStaticProjectPath('\\sourcePath'), false)
        assert.strictEqual(pathQuickFixComponents.isStaticProjectPath('one,two'), false)
    })

    it('should create a portable project-relative replacement', () => {
        const documentFile = path.resolve('/workspace/chapters/main.tex')
        const candidate = path.resolve('/workspace/figures/chart.png')

        assert.strictEqual(
            pathQuickFixComponents.candidateReplacement(
                { end: 0, kind: 'image', start: 0, value: 'chart' },
                candidate,
                documentFile
            ),
            '../figures/chart'
        )
    })
})
