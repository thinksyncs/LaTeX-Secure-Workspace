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

test('Docker manual matches the pinned CI image and README keeps the local sample', () => {
    const readme = read('README.md')
    const manual = read('docs/manual/README.md')
    const workflow = read('.github/workflows/docker-secure-builds.yml')
    const imageMatch = workflow.match(/LATEXWORKSHOP_DOCKER_TEST_IMAGE: (\S+)/)
    assert.ok(imageMatch, 'Docker CI must declare LATEXWORKSHOP_DOCKER_TEST_IMAGE')
    const image = imageMatch[1]
    const settingsMatch = manual.match(/```json\n([\s\S]*?)```/)
    assert.ok(settingsMatch, 'Docker manual must include a JSON User Settings example')
    const settings = JSON.parse(settingsMatch[1])
    assert.equal(settings['latex-workshop.docker.image.latex'], image)
    assert.equal(settings['latex-workshop.docker.enabled'], true)
    assert.equal(settings['latex-workshop.docker.path'], 'docker')
    assert.ok(manual.includes(`docker pull ${image}`))
    assert.ok(readme.includes('./docs/manual/README.md#optional-docker-setup'))
    assert.ok(readme.includes('Use Local TeX'))
    const sampleMatch = readme.match(/```latex\n([\s\S]*?)```/)
    assert.ok(sampleMatch, 'README must include a LaTeX onboarding sample')
    const sample = sampleMatch[1].replace(/^ {3}/gm, '').trim()
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

test('local setup is discoverable and its guide is included in the package inputs', () => {
    const command = manifest.contributes.commands.find(item => item.command === 'latex-workshop.setup-local')
    assert.ok(command)
    assert.equal(command.enablement, '!virtualWorkspace && isWorkspaceTrusted')
    assert.ok(read('src/app.ts').includes("registerCommand('latex-workshop.setup-local'"))
    const guide = read('resources/local-setup.md')
    const sample = guide.match(/```latex\n([\s\S]*?)```/)
    assert.ok(sample)
    assert.equal(sample[1].trim(), read('samples/sample/t.tex').trim())
    assert.ok(guide.includes('Use Local TeX'))
    assert.ok(guide.includes('Check Again'))
    assert.ok(read('.vscodeignore').split(/\r?\n/).includes('artifacts/'), 'Local validation evidence must not ship in the VSIX')
})
