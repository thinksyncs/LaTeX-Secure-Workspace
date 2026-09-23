import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { assert, mock } from './utils'
import { lw } from '../../src/lw'
import { copyFirstPdfSample, createFirstPdfSample } from '../../src/compile/first-pdf'

describe('37_first_pdf:', () => {
    let temporary: string
    let pick: sinon.SinonStub
    let choose: sinon.SinonStub
    let errors: sinon.SinonStub
    beforeEach(() => {
        temporary = fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), 'lw-first-pdf-'))
        mock.init(lw)
        sinon.stub(vscode.workspace, 'isTrusted').value(true)
        sinon.stub(vscode.workspace, 'workspaceFolders').value([{uri: vscode.Uri.file(temporary), name: 'sample', index: 0}])
        sinon.stub(vscode.env, 'remoteName').value(undefined)
        const englishSample = {label: 'English', language: 'english'}
        pick = sinon.stub(vscode.window, 'showQuickPick').resolves(englishSample)
        choose = sinon.stub(vscode.window, 'showOpenDialog').resolves([vscode.Uri.file(temporary)])
        errors = sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined)
        sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined)
    })
    afterEach(() => {
        sinon.restore()
        fs.rmSync(temporary, {recursive: true, force: true})
    })

    it('should copy the bundled English and Japanese samples without overwriting', async () => {
        for (const language of ['english', 'japanese'] as const) {
            const target = await copyFirstPdfSample(temporary, language)
            assert.strictEqual(fs.readFileSync(target, 'utf8'), fs.readFileSync(path.join(lw.extensionRoot, 'resources', `sample-${language}.tex`), 'utf8'))
            fs.writeFileSync(target, 'keep the user document')
            await assert.rejects(copyFirstPdfSample(temporary, language), /EEXIST/)
            assert.strictEqual(fs.readFileSync(target, 'utf8'), 'keep the user document')
        }
    })

    it('should write nothing after either picker is cancelled', async () => {
        pick.resolves(undefined)
        await createFirstPdfSample()
        assert.ok(choose.notCalled)
        pick.resolves({label: 'English', language: 'english'})
        choose.resolves(undefined)
        await createFirstPdfSample()
        assert.deepStrictEqual(fs.readdirSync(temporary), [])
    })

    it('should reject a selected folder outside the workspace', async () => {
        choose.resolves([vscode.Uri.file(path.dirname(temporary))])
        await createFirstPdfSample()
        assert.ok(String(errors.firstCall.args[0]).includes('inside the current workspace'))
        assert.deepStrictEqual(fs.readdirSync(temporary), [])
    })

    it('should not start a build or download after creating a sample', async () => {
        const command = sinon.stub(vscode.commands, 'executeCommand').resolves(undefined)
        const network = sinon.stub(globalThis, 'fetch').rejects(new Error('Sample creation must not fetch'))
        const show = sinon.stub(vscode.window, 'showTextDocument').resolves()
        await createFirstPdfSample()
        assert.ok(fs.existsSync(path.join(temporary, 'first-pdf-english.tex')))
        assert.ok(show.calledOnce)
        assert.ok(command.notCalled)
        assert.ok(network.notCalled)
    })
})
