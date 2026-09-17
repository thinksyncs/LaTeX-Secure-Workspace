import * as vscode from 'vscode'
import * as path from 'path'
import * as assert from 'assert'
import * as fs from 'fs'
import { lw } from '../../src/lw'
import * as test from './utils'
import { testFileStem } from '../file-name'

suite('Product surface test suite', () => {
    test.suite.name = testFileStem(__filename)
    test.suite.fixture = 'testground'

    suiteSetup(async () => {
        // The existing isolated runner uses explicit local pdfLaTeX compatibility.
        // Real container coverage lives in dev/testDockerBuild.mjs.
        await test.activateExtension()
    })

    teardown(async () => {
        await test.reset()
    })

    test.run('deprecated settings remain readable when unset and explicitly configured', async () => {
        const section = 'latex.autoBuild.run'
        const configuration = vscode.workspace.getConfiguration('latex-workshop')
        const original = configuration.inspect<string>(section)?.globalValue
        try {
            await configuration.update(section, undefined, vscode.ConfigurationTarget.Global)
            assert.strictEqual(vscode.workspace.getConfiguration('latex-workshop').inspect(section)?.globalValue, undefined)
            await configuration.update(section, 'onSave', vscode.ConfigurationTarget.Global)
            assert.strictEqual(vscode.workspace.getConfiguration('latex-workshop').inspect(section)?.globalValue, 'onSave')
            const extension = vscode.extensions.getExtension('ToppyMicroServices.tex-workspace-secure')
            assert.ok(extension)
            const manifest = extension.packageJSON as {
                contributes: {
                    configuration: {properties: Record<string, {markdownDeprecationMessage?: string}>},
                    commands: {command: string, category: string}[]
                }
            }
            const property = manifest.contributes.configuration.properties['latex-workshop.' + section]
            assert.ok(property.markdownDeprecationMessage)
            const registered = await vscode.commands.getCommands(true)
            for (const command of manifest.contributes.commands) {
                assert.ok(registered.includes(command.command), command.command)
                assert.ok(command.category.startsWith('LaTeX Workspace Security'))
            }
        } finally {
            await configuration.update(section, original, vscode.ConfigurationTarget.Global)
        }
    })

    test.run('existing onboarding sample builds and opens a PDF tab', async (fixture: string) => {
        const sample = path.resolve(__dirname, '../../../samples/sample/t.tex')
        await test.load(fixture, [{src: sample, dst: 't.tex'}], {skipCache: true})
        await test.build(fixture, 't.tex')
        const pdfPath = path.join(fixture, '.lw-security', 't.pdf')
        assert.strictEqual(lw.compile.compiledPDFPath, pdfPath)
        assert.strictEqual(fs.readFileSync(pdfPath).subarray(0, 5).toString(), '%PDF-')
        const hasPdfTab = () => vscode.window.tabGroups.all.some(group => group.tabs.some(tab =>
            tab.input instanceof vscode.TabInputCustom
            && tab.input.uri.fsPath === pdfPath
            && tab.input.viewType === 'tex-workspace-secure.pdf-preview'))
        // The registered provider is in the extension bundle, not this test's
        // source-module instance. Inspect VS Code's public tab state instead.
        for (let attempt = 0; attempt < 40 && !hasPdfTab(); attempt++) {
            await test.sleep(100)
        }
        assert.ok(hasPdfTab(), 'Expected the onboarding PDF in the secure custom editor')
        // A registered tab is not proof of visible pixels or a Docker first run.
    })
})
