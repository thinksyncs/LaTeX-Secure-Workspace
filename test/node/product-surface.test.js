'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.resolve(__dirname, '../..')
const read = file => fs.readFileSync(path.join(root, file), 'utf8')
const manifest = JSON.parse(read('package.json'))
const properties = manifest.contributes.configuration.properties
const retained = [
    'latex.build.enableMagicComments', 'latex.outDir', 'latex.auxDir', 'latex.jobname',
    'latex.search.rootFiles.include', 'latex.search.rootFiles.exclude', 'latex.rootFile.indicator'
].map(key => `latex-workshop.${key}`)

test('compatibility inventory covers every setting and preserves active editor settings', () => {
    const inventory = read('docs/compatibility-settings.md')
    const entries = Object.entries(properties).filter(([, value]) =>
        value.markdownDescription?.includes('Compatibility setting retained from upstream'))
    assert.equal(entries.length, 35)
    assert.equal(entries.filter(([, value]) => value.markdownDeprecationMessage).length, 28)
    for (const [key, value] of entries) {
        const decision = retained.includes(key) ? 'Retained' : 'Deprecated'
        assert.ok(inventory.includes(`| \`${key.slice('latex-workshop.'.length)}\` | ${decision} |`), key)
        if (retained.includes(key)) {
            assert.equal(value.markdownDeprecationMessage, undefined, key)
        } else {
            assert.match(value.markdownDeprecationMessage, /Retained for compatibility/, key)
        }
    }
    assert.equal(properties['latex-workshop.security.allowLocalPdfLaTeX'].default, false)
})

test('first-build example matches the pinned CI image and the existing sample', () => {
    const readme = read('README.md')
    const workflow = read('.github/workflows/docker-secure-builds.yml')
    const image = workflow.match(/LATEXWORKSHOP_DOCKER_TEST_IMAGE: (\S+)/)[1]
    const settings = JSON.parse(readme.match(/```json\n([\s\S]*?)```/)[1])
    assert.equal(settings['latex-workshop.docker.image.latex'], image)
    assert.equal(settings['latex-workshop.docker.enabled'], true)
    assert.equal(settings['latex-workshop.docker.path'], 'docker')
    assert.ok(readme.includes(`docker pull ${image}`))
    const sample = readme.match(/```latex\n([\s\S]*?)```/)[1].replace(/^ {3}/gm, '').trim()
    assert.equal(sample, read('samples/sample/t.tex').trim())
    assert.ok(read('docs/manual/README.md').includes('../../README.md#get-started'))
})

test('visible command branding retains the extension and command identifiers', () => {
    assert.equal(`${manifest.publisher}.${manifest.name}`, 'ToppyMicroServices.tex-workspace-secure')
    for (const command of manifest.contributes.commands) {
        assert.match(command.command, /^latex-workshop(?:-dev)?\./)
        assert.ok(['LaTeX Workspace Security', 'LaTeX Workspace Security DevTools'].includes(command.category))
    }
    for (const file of fs.readdirSync(root).filter(file => /^package\.nls(?:\..+)?\.json$/.test(file))) {
        assert.ok(JSON.parse(read(file))['command.log'].includes('LaTeX Workspace Security'), file)
    }
})
