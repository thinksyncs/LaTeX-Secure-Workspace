import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { assert } from './utils'
import { clean } from '../../src/extras/cleaner'
import { testFileSuiteName } from '../file-name'

describe(testFileSuiteName(__filename), () => {
    it('should not clean through a symbolic link used as the secure build directory', async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-clean-project-'))
        const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-clean-target-'))
        const rootFile = path.join(projectDir, 'main.tex')
        const targetFile = path.join(targetDir, 'main.aux')
        fs.writeFileSync(rootFile, '\\documentclass{article}\n')
        fs.writeFileSync(targetFile, 'keep')
        fs.symlinkSync(targetDir, path.join(projectDir, '.lw-security'), process.platform === 'win32' ? 'junction' : 'dir')
        const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage')

        try {
            await clean(rootFile)

            assert.ok(fs.existsSync(targetFile))
            assert.strictEqual(showErrorStub.firstCall?.args[0], 'Secure cleanup directory is unsafe. Remove symbolic links from .lw-security and try again.')
            assert.strictEqual(showErrorStub.firstCall?.args[1], 'Open LaTeX-Secure-Workspace log')
        } finally {
            showErrorStub.restore()
            fs.rmSync(projectDir, { recursive: true, force: true })
            fs.rmSync(targetDir, { recursive: true, force: true })
        }
    })

    it('should treat glob metacharacters in the root basename literally', async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-clean-glob-project-'))
        const secureBuildDir = path.join(projectDir, '.lw-security')
        const rootFile = path.join(projectDir, 'report[1].tex')
        const exactArtifact = path.join(secureBuildDir, 'report[1].aux')
        const globMatchArtifact = path.join(secureBuildDir, 'report1.aux')
        fs.mkdirSync(secureBuildDir)
        fs.writeFileSync(rootFile, '\\documentclass{article}\n')
        fs.writeFileSync(exactArtifact, 'remove')
        fs.writeFileSync(globMatchArtifact, 'keep')

        try {
            await clean(rootFile)

            assert.ok(!fs.existsSync(exactArtifact))
            assert.ok(fs.existsSync(globMatchArtifact))
        } finally {
            fs.rmSync(projectDir, { recursive: true, force: true })
        }
    })

    it('should notify and preserve an artifact when deletion fails', async () => {
        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-clean-failure-project-'))
        const secureBuildDir = path.join(projectDir, '.lw-security')
        const rootFile = path.join(projectDir, 'main.tex')
        const artifact = path.join(secureBuildDir, 'main.aux')
        fs.mkdirSync(secureBuildDir)
        fs.writeFileSync(rootFile, '\\documentclass{article}\n')
        fs.writeFileSync(artifact, 'keep')
        const unlinkStub = sinon.stub(fs.promises, 'unlink').rejects(Object.assign(new Error('denied'), { code: 'EACCES' }))
        const showErrorStub = sinon.stub(vscode.window, 'showErrorMessage')

        try {
            await clean(rootFile)

            assert.ok(fs.existsSync(artifact))
            const errorCalls = showErrorStub.getCalls().map(call => call.args as unknown[])
            assert.ok(errorCalls.some(args =>
                args[0] === 'Secure cleanup failed for one or more build artifacts. Open the extension log for details.'
                && args[1] === 'Open LaTeX-Secure-Workspace log'
            ))
        } finally {
            unlinkStub.restore()
            showErrorStub.restore()
            fs.rmSync(projectDir, { recursive: true, force: true })
        }
    })
})
