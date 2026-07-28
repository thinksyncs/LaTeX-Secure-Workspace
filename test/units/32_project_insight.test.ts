import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

import { projectInsightComponents } from '../../src/core/project-insight'
import { assert } from './utils'
import { testFileSuiteName } from '../file-name'

describe(testFileSuiteName(__filename), () => {
    it('should parse project-local input and import dependencies', () => {
        const inputs = projectInsightComponents.parseInputs([
            '\\input{sections/intro}',
            '\\include{chapters/results.tex}',
            '\\subimport{appendix/}{proof}',
            '% \\input{commented}'
        ].join('\n'))

        assert.deepStrictEqual(inputs.slice(0, 3), [
            { value: 'sections/intro', display: 'sections/intro' },
            { value: 'chapters/results.tex', display: 'chapters/results.tex' },
            { value: 'proof', directory: 'appendix/', display: path.join('appendix/', 'proof') }
        ])
    })

    it('should parse BibTeX and biblatex resource declarations', () => {
        assert.deepStrictEqual(
            projectInsightComponents.parseBibliographies('\\bibliography{refs,shared/more}\\addbibresource{library.bib}'),
            ['refs', 'shared/more', 'library.bib']
        )
    })

    it('should recommend LuaLaTeX only when project evidence requires it', () => {
        assert.deepStrictEqual(projectInsightComponents.detectEngine(['\\documentclass{article}']), {
            engine: 'pdflatex',
            signals: []
        })
        assert.deepStrictEqual(projectInsightComponents.detectEngine([
            '\\usepackage{fontspec}',
            '\\setmainfont{Noto Serif}'
        ]), {
            engine: 'lualatex',
            signals: ['fontspec package', 'system font command']
        })
    })

    it('should find the active source chain through nested dependencies', () => {
        const root = path.resolve('/workspace/main.tex')
        const section = path.resolve('/workspace/sections/section.tex')
        const leaf = path.resolve('/workspace/sections/leaf.tex')
        const chain = projectInsightComponents.findDependencyChain(root, leaf, [
            { from: root, to: section },
            { from: section, to: leaf }
        ])

        assert.deepStrictEqual(chain, [root, section, leaf])
    })

    it('should fingerprint files without changing their contents', async () => {
        const filePath = path.resolve(__dirname, '../../../package.json')
        const content = fs.readFileSync(filePath)
        const fingerprint = await projectInsightComponents.fingerprintFile(filePath)

        assert.strictEqual(fingerprint.bytes, content.byteLength)
        assert.strictEqual(fingerprint.sha256, crypto.createHash('sha256').update(content).digest('hex'))
    })
})
