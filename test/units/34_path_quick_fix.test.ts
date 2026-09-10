import * as path from 'path'
import * as fs from 'fs'
import * as vscode from 'vscode'
import * as sinon from 'sinon'

import { PathQuickFixProvider, pathQuickFixComponents } from '../../src/language/path-quick-fix'
import { assert, get, set } from './utils'
import { testFileSuiteName } from '../file-name'

describe(testFileSuiteName(__filename), () => {
    afterEach(() => {
        sinon.restore()
    })

    it('should locate arguments independently of matching command names and options', () => {
        for (const content of ['\\input{input}', '\\includegraphics[width=2cm]{width}', '\\includegraphics[width=2cm]{ width }']) {
            const [reference] = pathQuickFixComponents.findPathReferences(content)
            const replacement = content.slice(0, reference.start) + 'fixed/path' + content.slice(reference.end)
            assert.strictEqual(replacement, content.replace(/\{(\s*)\w+(\s*)\}$/, '{$1fixed/path$2}'))
        }
    })

    it('should ignore paths in code examples and keep following argument offsets', () => {
        const ignored = '\\verb|% \\input{sample}|\\begin{verbatim}\\input{sample}\\end{verbatim}\r\n% \\input{sample}\r\n'
        const content = ignored + '\\input{sample}'
        assert.deepStrictEqual(pathQuickFixComponents.findPathReferences(content), [{
            start: ignored.length + 7,
            end: ignored.length + 13,
            kind: 'tex',
            value: 'sample'
        }])
    })

    it('should offer a build-root-relative fix for a missing input in a child document', async () => {
        const rootFile = set.root('34_path_quick_fix', 'main.tex')
        const documentFile = get.path('34_path_quick_fix', 'chapters', 'intro.tex')
        const candidate = get.path('34_path_quick_fix', 'chapters', 'review-target.tex')
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(documentFile))
        sinon.stub(vscode.workspace, 'findFiles').resolves([vscode.Uri.file(candidate)])
        const position = document.positionAt(document.getText().indexOf('review-target'))

        const actions = await new PathQuickFixProvider().provideCodeActions(document, new vscode.Range(position, position))

        assert.strictEqual(actions.length, 1)
        const [edit] = actions[0].edit!.get(document.uri)
        assert.strictEqual(document.getText(edit.range), 'review-target')
        assert.strictEqual(edit.newText, 'chapters/review-target')
        assert.ok(fs.existsSync(path.resolve(path.dirname(rootFile), edit.newText + '.tex')))
    })

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

    it('should create a portable build-root-relative replacement', () => {
        const rootDir = path.resolve('/workspace')
        const candidate = path.resolve('/workspace/figures/chart.png')

        assert.strictEqual(
            pathQuickFixComponents.candidateReplacement(
                { end: 0, kind: 'image', start: 0, value: 'chart' },
                candidate,
                rootDir
            ),
            'figures/chart'
        )
    })
})
