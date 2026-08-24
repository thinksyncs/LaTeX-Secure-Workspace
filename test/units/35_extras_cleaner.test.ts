import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
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

        try {
            await clean(rootFile)

            assert.ok(fs.existsSync(targetFile))
        } finally {
            fs.rmSync(projectDir, { recursive: true, force: true })
            fs.rmSync(targetDir, { recursive: true, force: true })
        }
    })
})
