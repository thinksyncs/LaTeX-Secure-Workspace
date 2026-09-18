import * as path from 'path'
import * as vscode from 'vscode'
import * as sinon from 'sinon'
import type { SpawnOptions } from 'child_process'
import * as cs from 'cross-spawn'
import { assert, get, log, mock, set, TextDocument, TextEditor } from './utils'
import { lw } from '../../src/lw'
import { autoBuild, build, buildWithResult } from '../../src/compile/build'
import { testFileSuiteName } from '../file-name'
import * as commands from '../../src/core/commands'
import * as projectInsight from '../../src/core/project-insight'
import { setupLocalBuild } from '../../src/compile/local-setup'

const buildWithRootCandidate = commands.buildWithRootCandidate

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
        sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined)
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

        for (const candidateCount of [1, 2]) {
            it('should start the selected root build with ' + candidateCount + ' candidates', async () => {
                const selectedRoot = get.path('selected.tex')
                const candidates = candidateCount === 1 ? [selectedRoot] : [get.path('other.tex'), selectedRoot]
                sinon.stub(projectInsight, 'getBuildRootCandidates').resolves(candidates)
                const document = new TextDocument(selectedRoot, '', { languageId: 'doctex' })
                const selected: vscode.QuickPickItem & { filePath: string } = {
                    label: 'selected.tex', filePath: selectedRoot
                }
                sinon.stub(vscode.workspace, 'openTextDocument').resolves(document)
                sinon.stub(vscode.window, 'showQuickPick').resolves(selected)
                ;(lw.compile.buildWithResult as sinon.SinonStub).callsFake(buildWithResult)

                await buildWithRootCandidate()

                assert.ok((lw.compile.buildWithResult as sinon.SinonStub).calledOnceWithExactly(false, selectedRoot, 'doctex', undefined))
                assert.ok((lw.external.spawn as sinon.SinonStub).calledOnce)
                assert.hasLog('Building root file: ' + selectedRoot)
                assert.notHasLog('Cannot find LaTeX root file.')
            })
        }

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

        it('should offer local setup before probing or spawning', async () => {
            set.config('security.allowLocalPdfLaTeX', false)
            const prompt = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined)
            const syncStub = lw.external.sync as sinon.SinonStub
            const spawnStub = lw.external.spawn as sinon.SinonStub

            const succeeded = await build()

            assert.strictEqual(succeeded, false)
            assert.ok(syncStub.notCalled)
            assert.ok(spawnStub.notCalled)
            assert.strictEqual(prompt.firstCall.args[0], 'Set up your first LaTeX build')
            assert.ok(String((prompt.firstCall.args[1] as vscode.MessageOptions).detail).includes('all trusted workspaces'))
            assert.deepStrictEqual(prompt.firstCall.args.slice(2), ['Use Local TeX', 'Docker Settings'])
            assert.hasLog('Local TeX setup cancelled; no tools started or settings changed.')
        })

        it('should check local tools, save consent, and continue the first build', async () => {
            set.config('security.allowLocalPdfLaTeX', false)
            const updateHandler: vscode.WorkspaceConfiguration['update'] = (section, value, target) => {
                assert.strictEqual(section, 'security.allowLocalPdfLaTeX')
                assert.strictEqual(value, true)
                assert.strictEqual(target, vscode.ConfigurationTarget.Global)
                assert.ok((lw.external.sync as sinon.SinonStub).calledWith('latexmk', ['-version']))
                assert.ok((lw.external.sync as sinon.SinonStub).calledWith('pdflatex', ['--version']))
                assert.ok((lw.external.spawn as sinon.SinonStub).notCalled)
                set.config('security.allowLocalPdfLaTeX', true)
                return Promise.resolve()
            }
            const updateSpy = sinon.spy(updateHandler)
            set.configUpdate(updateSpy)
            const prompt = sinon.stub(vscode.window, 'showInformationMessage').resolves('Use Local TeX' as unknown as vscode.MessageItem)

            const succeeded = await build()

            assert.strictEqual(succeeded, true)
            assert.ok(prompt.calledOnce)
            assert.ok(updateSpy.calledOnce)
            assert.ok((lw.external.sync as sinon.SinonStub).neverCalledWith('docker'))
            assert.hasLog('Local pdfLaTeX setup saved in User Settings.')
            assert.hasLog(`Building root file: ${get.path('main.tex')}`)
        })

        for (const selection of ['Cancel', undefined]) {
            it(`should report no build started after ${selection ?? 'dismissing'} the security prompt`, async () => {
                set.config('security.allowLocalPdfLaTeX', false)
                sinon.stub(vscode.window, 'showInformationMessage').resolves(selection as unknown as vscode.MessageItem)
                const updateSpy = sinon.spy(() => Promise.resolve())
                set.configUpdate(updateSpy)

                const result = await buildWithResult()

                assert.strictEqual(result, 'not-started')
                assert.ok((lw.external.spawn as sinon.SinonStub).notCalled)
                assert.ok((lw.external.sync as sinon.SinonStub).notCalled)
                assert.ok(updateSpy.notCalled)
            })
        }

        it('should open Docker settings without probing or changing the build mode', async () => {
            set.config('security.allowLocalPdfLaTeX', false)
            sinon.stub(vscode.window, 'showInformationMessage').resolves('Docker Settings' as unknown as vscode.MessageItem)
            const command = sinon.stub(vscode.commands, 'executeCommand').resolves()
            const update = sinon.spy(() => Promise.resolve())
            set.configUpdate(update)

            assert.strictEqual(await buildWithResult(), 'not-started')
            assert.ok(command.calledOnceWithExactly('workbench.action.openSettings', '@ext:ToppyMicroServices.tex-workspace-secure docker'))
            assert.ok((lw.external.sync as sinon.SinonStub).notCalled)
            assert.ok((lw.external.spawn as sinon.SinonStub).notCalled)
            assert.ok(update.notCalled)
        })

        it('should leave consent unset and offer a bundled guide when local tools are missing', async () => {
            set.config('security.allowLocalPdfLaTeX', false)
            sinon.stub(vscode.window, 'showInformationMessage').resolves('Use Local TeX' as unknown as vscode.MessageItem)
            ;(lw.external.sync as sinon.SinonStub).withArgs('latexmk').returns({status: 1, stderr: 'Perl is missing'})
            ;(vscode.window.showErrorMessage as sinon.SinonStub).resolves('Installation Guide')
            const command = sinon.stub(vscode.commands, 'executeCommand').resolves()
            const update = sinon.spy(() => Promise.resolve())
            set.configUpdate(update)

            assert.strictEqual(await buildWithResult(), 'not-started')
            assert.ok(command.calledOnce)
            assert.strictEqual(command.firstCall.args[0], 'markdown.showPreview')
            assert.pathStrictEqual((command.firstCall.args[1] as vscode.Uri).fsPath, path.join(lw.extensionRoot, 'resources', 'local-setup.md'))
            assert.ok(update.notCalled)
            assert.ok((lw.external.spawn as sinon.SinonStub).notCalled)
        })

        it('should retry detection and continue without another consent prompt', async () => {
            set.config('security.allowLocalPdfLaTeX', false)
            const prompt = sinon.stub(vscode.window, 'showInformationMessage').resolves('Use Local TeX' as unknown as vscode.MessageItem)
            ;(lw.external.sync as sinon.SinonStub).withArgs('latexmk').onFirstCall().returns({status: 1, stderr: 'not ready'})
            ;(vscode.window.showErrorMessage as sinon.SinonStub).resolves('Check Again')
            set.configUpdate((section, value) => {
                set.config(section, value)
                return Promise.resolve()
            })

            assert.strictEqual(await buildWithResult(), 'succeeded')
            assert.ok(prompt.calledOnce)
            assert.strictEqual((lw.external.sync as sinon.SinonStub).getCalls().filter(call => call.args[0] === 'latexmk').length, 2)
            assert.ok((lw.external.spawn as sinon.SinonStub).calledOnce)
        })

        it('should not launch a build if saving consent fails', async () => {
            set.config('security.allowLocalPdfLaTeX', false)
            sinon.stub(vscode.window, 'showInformationMessage').resolves('Use Local TeX' as unknown as vscode.MessageItem)
            set.configUpdate(() => Promise.reject(new Error('Settings are read-only')))

            assert.strictEqual(await buildWithResult(), 'not-started')
            assert.ok((lw.external.spawn as sinon.SinonStub).notCalled)
            assert.hasLog('Could not save local TeX setup.')
        })

        it('should not prompt or run local setup in Restricted Mode', async () => {
            sinon.stub(vscode.workspace, 'isTrusted').value(false)
            sinon.stub(vscode.window, 'showWarningMessage').resolves(undefined)
            const prompt = sinon.stub(vscode.window, 'showInformationMessage')

            await setupLocalBuild()

            assert.ok(prompt.notCalled)
            assert.ok((lw.external.sync as sinon.SinonStub).notCalled)
            assert.ok((lw.external.spawn as sinon.SinonStub).notCalled)
        })

        it('should preserve an existing Docker setup', async () => {
            set.config('docker.enabled', true)
            const prompt = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined)
            const update = sinon.spy(() => Promise.resolve())
            set.configUpdate(update)

            await setupLocalBuild()

            assert.ok(String(prompt.firstCall.args[0]).includes('will not change your existing build mode'))
            assert.ok(update.notCalled)
            assert.ok((lw.external.sync as sinon.SinonStub).notCalled)
        })

        it('should not probe host tools for a virtual workspace', async () => {
            sinon.stub(vscode.workspace, 'workspaceFolders').value([{uri: vscode.Uri.parse('memfs:/project'), name: 'virtual', index: 0}])
            sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined)

            await setupLocalBuild()

            assert.ok((lw.external.sync as sinon.SinonStub).notCalled)
            assert.ok((lw.external.spawn as sinon.SinonStub).notCalled)
        })

        it('should check an existing local setup without starting a build or changing settings', async () => {
            const prompt = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined)
            const update = sinon.spy(() => Promise.resolve())
            set.configUpdate(update)

            await setupLocalBuild()

            assert.ok(String(prompt.firstCall.args[0]).includes('Local pdfLaTeX is ready'))
            assert.ok((lw.external.sync as sinon.SinonStub).calledWith('latexmk', ['-version']))
            assert.ok((lw.external.spawn as sinon.SinonStub).notCalled)
            assert.ok(update.notCalled)
        })

        it('should distinguish failed execution from a request that did not start', async () => {
            const spawnStub = lw.external.spawn as sinon.SinonStub
            spawnStub.callsFake(() => cs.spawn(process.execPath, ['-e', 'process.exit(1)']))

            const result = await buildWithResult()

            assert.strictEqual(result, 'failed')
            assert.ok(spawnStub.calledOnce)
        })

        it('should report successful execution through the detailed result', async () => {
            const result = await buildWithResult()

            assert.strictEqual(result, 'succeeded')
            assert.ok((lw.external.spawn as sinon.SinonStub).calledOnce)
        })

        it('should report no build started when the output directory is rejected', async () => {
            sinon.stub(lw.file, 'getValidatedSecurityBuildDir').throws(new Error('unsafe output directory'))

            const result = await buildWithResult()

            assert.strictEqual(result, 'not-started')
            assert.ok((lw.external.spawn as sinon.SinonStub).notCalled)
            assert.hasLog('Secure build output directory rejected.')
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

            const result = await buildWithResult()

            assert.strictEqual(result, 'not-started')
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
