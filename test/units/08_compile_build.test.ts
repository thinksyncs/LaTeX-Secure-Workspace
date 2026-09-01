import * as path from 'path'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import type { SpawnOptions } from 'child_process'
import * as cs from 'cross-spawn'
import { assert, get, log, mock, set, TextEditor } from './utils'
import { lw } from '../../src/lw'
import { autoBuild, build } from '../../src/compile/build'
import { testFileSuiteName } from '../file-name'

describe(testFileSuiteName(__filename), () => {
    let activeStub: sinon.SinonStub
    let findStub: sinon.SinonStub

    beforeEach(() => {
        mock.init(lw)
        set.config('security.allowLocalPdfLaTeX', true)
        ;(lw.cache.getIncludedTeX as sinon.SinonStub).returns([get.path('main.tex')])
        ;(lw.extra.clean as sinon.SinonStub).resolves(Promise.resolve())
        lw.compile.lastAutoBuildTime = 0
        activeStub = mock.activeTextEditor(get.path('main.tex'), '', { languageId: 'latex' })
        findStub = lw.root.resolveSecurityRoot as sinon.SinonStub
        findStub.callsFake(() => {
            set.root('main.tex')
            return Promise.resolve(get.path('main.tex'))
        })
        sinon.stub(lw.external, 'spawn').callsFake((command: string, args?: readonly string[], options?: SpawnOptions) => {
            void command
            void args
            void options
            return cs.spawn(process.execPath, ['-e', 'process.exit(0)'])
        })
        const successfulProbe: ReturnType<typeof lw.external.sync> = {
            error: undefined,
            pid: 1,
            output: [null, Buffer.from('tool version'), Buffer.from('')],
            signal: null,
            status: 0,
            stdout: Buffer.from('tool version'),
            stderr: Buffer.from('')
        }
        sinon.stub(lw.external, 'sync').returns(successfulProbe)
    })

    afterEach(() => {
        activeStub.restore()
        findStub.resetHistory()
        sinon.restore()
    })

    describe('lw.compile->build.build', () => {
        it('should do nothing if there is no active text editor', async () => {
            activeStub.restore()
            lw.previousActive = undefined

            await build()

            assert.hasLog('Cannot start to build because the active editor is undefined.')
        })

        it('should build using the previous active LaTeX editor when a PDF tab is focused', async () => {
            activeStub.restore()
            lw.previousActive = new TextEditor(get.path('main.tex'), '', { languageId: 'latex' }) as unknown as typeof lw.previousActive

            await build()

            assert.ok(findStub.called)
            assert.hasLog(`Building root file: ${get.path('main.tex')}`)
        })

        it('should try find the secure root if not given as an argument', async () => {
            await build()

            assert.ok(findStub.called)
        })

        for (const [languageId, fileName] of [
            ['latex-class', 'document.cls'],
            ['latex-package', 'helpers.sty'],
            ['bibtex', 'references.bib']
        ] as const) {
            it(`should resolve the secure root when building from a ${languageId} editor`, async () => {
                activeStub.restore()
                activeStub = mock.activeTextEditor(get.path(fileName), '', { languageId })

                const succeeded = await build()

                assert.strictEqual(succeeded, true)
                assert.ok(findStub.calledOnce)
                assert.hasLog(`Building root file: ${get.path('main.tex')}`)
            })
        }

        it('should skip finding root if given as an argument', async () => {
            await build(false, get.path('alt.tex'), 'latex')

            assert.ok(!findStub.called)
        })

        it('should ignore external build commands and continue with the fixed secure recipe', async () => {
            set.config('latex.external.build.command', 'bash')
            set.config('latex.external.build.args', ['-c', 'exit 0'])

            await build()

            assert.hasLog('Ignoring external build command in this secure build.')
            assert.hasLog('Recipe step 1 The command is latexmk:')
        })

        it('should use the root file directory as cwd when building', async () => {
            set.root('main.tex')
            const spawnStub = lw.external.spawn as sinon.SinonStub

            await build()

            const spawnOptions = spawnStub.getCall(0)?.args?.[2] as { cwd?: string } | undefined
            assert.pathStrictEqual(spawnOptions?.cwd?.toString(), path.dirname(get.path('main.tex')))
        })

        it('should keep using the resolved main root when subfiles are detected', async () => {
            lw.root.subfiles.path = get.path('subfile.tex')
            lw.root.file.langId = 'latex'

            await build()

            lw.root.subfiles.path = undefined
            lw.root.file.langId = undefined

            assert.hasLog(`Building root file: ${get.path('main.tex')}`)
        })

        it('should reject host pdfLaTeX by default before probing or spawning', async () => {
            set.config('security.allowLocalPdfLaTeX', false)
            const warningStub = sinon.stub(vscode.window, 'showWarningMessage').resolves('No' as unknown as vscode.MessageItem)
            const syncStub = lw.external.sync as sinon.SinonStub
            const spawnStub = lw.external.spawn as sinon.SinonStub

            const succeeded = await build()

            assert.strictEqual(succeeded, false)
            assert.ok(syncStub.neverCalledWith('latexmk', ['--version']))
            assert.ok(syncStub.neverCalledWith('pdflatex', ['--version']))
            assert.ok(spawnStub.notCalled)
            assert.ok(String(warningStub.firstCall.args[0]).includes('This is not a TeX compilation error.'))
            assert.deepStrictEqual(warningStub.firstCall.args.slice(1), [{ modal: true }, 'Yes', 'No'])
            assert.hasLog('Build stopped by the security policy before pdfLaTeX started.')
            assert.hasLog('Local pdfLaTeX compatibility was not enabled.')
        })

        it('should enable local pdfLaTeX in User Settings and continue after Yes', async () => {
            set.config('security.allowLocalPdfLaTeX', false)
            const updateHandler: vscode.WorkspaceConfiguration['update'] = (section, value, target) => {
                assert.strictEqual(section, 'security.allowLocalPdfLaTeX')
                assert.strictEqual(value, true)
                assert.strictEqual(target, vscode.ConfigurationTarget.Global)
                set.config('security.allowLocalPdfLaTeX', true)
                return Promise.resolve()
            }
            const updateSpy = sinon.spy(updateHandler)
            set.configUpdate(updateSpy)
            const warningStub = sinon.stub(vscode.window, 'showWarningMessage').resolves('Yes' as unknown as vscode.MessageItem)

            const succeeded = await build()

            assert.strictEqual(succeeded, true)
            assert.ok(warningStub.calledOnce)
            assert.ok(updateSpy.calledOnce)
            assert.hasLog('Enabled local pdfLaTeX compatibility in User Settings.')
            assert.hasLog(`Building root file: ${get.path('main.tex')}`)
        })

        it('should stop before spawning when required LaTeX tools are unavailable', async () => {
            const syncStub = lw.external.sync as sinon.SinonStub
            syncStub.withArgs('latexmk').returns({
                error: Object.assign(new Error('spawn latexmk ENOENT'), { code: 'ENOENT' }),
                status: null,
                stdout: Buffer.from(''),
                stderr: Buffer.from('')
            })
            const spawnStub = lw.external.spawn as sinon.SinonStub

            await build()

            assert.ok(spawnStub.notCalled)
            assert.hasLog('Required LaTeX tools unavailable: latexmk:')
        })

        it('should reject a local LuaLaTeX build before spawning', async () => {
            const warningStub = sinon.stub(vscode.window, 'showWarningMessage')
            const syncStub = lw.external.sync as sinon.SinonStub
            const spawnStub = lw.external.spawn as sinon.SinonStub

            const succeeded = await build(false, undefined, undefined, 'secure-lualatexmk')

            assert.strictEqual(succeeded, false)
            assert.ok(syncStub.neverCalledWith('lualatex', ['--version']))
            assert.ok(spawnStub.notCalled)
            assert.ok(String(warningStub.firstCall.args[0]).includes('This is not a TeX compilation error.'))
            assert.hasLog('Build stopped by the security policy before LuaLaTeX started.')
        })

        it('should validate the Docker runtime for the secure LuaLaTeX recipe', async () => {
            set.config('docker.enabled', true)
            set.config('docker.image.latex', 'example/texlive:stable')
            const syncStub = lw.external.sync as sinon.SinonStub

            await build(false, undefined, undefined, 'secure-lualatexmk')

            assert.ok(syncStub.calledWith('docker', ['--version']))
            assert.ok(syncStub.neverCalledWith('lualatex', ['--version']))
            assert.ok(syncStub.neverCalledWith('pdflatex', ['--version']))
            assert.hasLog('Recipe step 1 The command is')
        })

        it('should stop before spawning when Docker has no configured image', async () => {
            set.config('docker.enabled', true)
            set.config('docker.image.latex', '')
            const spawnStub = lw.external.spawn as sinon.SinonStub

            const succeeded = await build()

            assert.strictEqual(succeeded, false)
            assert.ok(spawnStub.notCalled)
            assert.hasLog('Docker build is enabled, but no LaTeX image is configured.')
        })

        it('should open the built pdf when the viewer is not already open', async () => {
            const viewStub = lw.viewer.view as sinon.SinonStub
            const fileStat = { type: vscode.FileType.File }
            sinon.stub(lw.file, 'exists').resolves(fileStat as vscode.FileStat)
            ;(lw.viewer.isViewing as sinon.SinonStub).returns(false)

            await build()

            assert.ok(viewStub.calledOnceWithExactly(vscode.Uri.file(get.path('.lw-security', 'main.pdf')), 'tab'))
        })

        it('should open an up-to-date pdf when latexmk skips compilation', async () => {
            const viewStub = lw.viewer.view as sinon.SinonStub
            const fileStat = { type: vscode.FileType.File }
            const currentParseLog = lw.parser.parse.log as sinon.SinonStub
            const parseLogStub = typeof currentParseLog.returns === 'function'
                ? currentParseLog
                : sinon.stub(lw.parser.parse, 'log')
            sinon.stub(lw.file, 'exists').resolves(fileStat as vscode.FileStat)
            ;(lw.viewer.isViewing as sinon.SinonStub).returns(false)
            parseLogStub.returns(true)

            await build()

            parseLogStub.resetBehavior()
            assert.ok(viewStub.calledOnceWithExactly(vscode.Uri.file(get.path('.lw-security', 'main.pdf')), 'tab'))
        })

        it('should refresh the built pdf when it is already open', async () => {
            const viewStub = lw.viewer.view as sinon.SinonStub
            const refreshStub = lw.viewer.refresh as sinon.SinonStub
            const fileStat = { type: vscode.FileType.File }
            sinon.stub(lw.file, 'exists').resolves(fileStat as vscode.FileStat)
            ;(lw.viewer.isViewing as sinon.SinonStub).returns(true)

            await build()

            assert.ok(refreshStub.calledOnceWithExactly(vscode.Uri.file(get.path('.lw-security', 'main.pdf'))))
            assert.ok(viewStub.notCalled)
        })

        it('should recover after post-build processing throws', async () => {
            const fileStat = { type: vscode.FileType.File }
            sinon.stub(lw.file, 'exists').resolves(fileStat as vscode.FileStat)
            ;(lw.viewer.isViewing as sinon.SinonStub).returns(false)
            const viewStub = lw.viewer.view as sinon.SinonStub
            viewStub.onFirstCall().rejects(new Error('viewer failed'))
            viewStub.onSecondCall().resolves()

            const firstBuild = await build()
            const secondBuild = await build()

            assert.strictEqual(firstBuild, false)
            assert.strictEqual(secondBuild, true)
            assert.strictEqual(viewStub.callCount, 2)
            assert.hasLog('Unexpected error while running secure build.')
        })
    })

    describe('lw.compile->build.spawnProcess', () => {
        it('should not use `shell: true` for fixed tool execution', async () => {
            const originalSpawn = lw.external.spawn
            let lastSpawnArgs: [command: string, args: readonly string[], options: SpawnOptions] | undefined
            lw.external.spawn = ((...args) => {
                lastSpawnArgs = args
                return cs.spawn(process.execPath, ['-e', 'process.exit(0)'])
            }) as typeof lw.external.spawn

            try {
                await build()
            } finally {
                lw.external.spawn = originalSpawn
            }

            assert.ok(lastSpawnArgs?.[2].shell === undefined)
            assert.strictEqual(lastSpawnArgs?.[0], 'latexmk')
        })
    })

    describe('lw.compile->build.autoBuild', () => {
        it('should ignore on-save auto build when configured', async () => {
            set.config('latex.autoBuild.run', 'onSave')

            log.start()
            await autoBuild(get.path('main.tex'), 'onSave')
            log.stop()

            assert.hasLog(`Auto build request ignored in this secure build (onSave): ${get.path('main.tex')}`)
            assert.notHasLog('Building root file:')
        })

        it('should ignore file-change auto build when configured', async () => {
            set.config('latex.autoBuild.run', 'onFileChange')

            log.start()
            await autoBuild(get.path('main.tex'), 'onFileChange')
            log.stop()

            assert.hasLog(`Auto build request ignored in this secure build (onFileChange): ${get.path('main.tex')}`)
            assert.notHasLog('Building root file:')
        })
    })
})
