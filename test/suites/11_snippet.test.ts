import * as vscode from 'vscode'
import * as path from 'path'
import * as assert from 'assert'
import * as test from './utils'
import { lw } from '../../src/lw'
import type { CompletionItem } from '../../src/types'

suite('Snippet test suite', () => {
    test.suite.name = path.basename(__filename).replace('.test.js', '')
    test.suite.fixture = 'testground'

    suiteSetup(async () => {
        await test.activateExtension()
        await vscode.workspace.getConfiguration('latex-workshop').update('latex.autoBuild.run', 'never')
    })

    teardown(async () => {
        await test.reset()
    })

    test.run('#3716 Too many braces', async (fixture: string) => {
        await test.load(fixture, [
            {src: 'base.tex', dst: 'main.tex'}
        ], {skipCache: true, open: 0})
        const active = vscode.window.activeTextEditor
        assert.ok(active)
        active.selection = new vscode.Selection(new vscode.Position(2, 0), new vscode.Position(2, 1))
        const items: CompletionItem[] = [{
            label: '\\fbox{}',
            detail: '\\fbox{${1:${TM_SELECTED_TEXT:text}}}',
            documentation: 'Command \\fbox{}.',
            filterText: 'fbox{}',
            insertText: new vscode.SnippetString('fbox{${1:${TM_SELECTED_TEXT:text}}}'),
            kind: 2
        }]
        await lw.completion.macro.surround(items)
        await vscode.commands.executeCommand('editor.action.formatDocument')
        await test.sleep(250)
        const changed = vscode.window.activeTextEditor?.document.getText()
        assert.ok(changed?.includes('\\fbox{a}bc'))
    }, ['linux', 'darwin'])
})
