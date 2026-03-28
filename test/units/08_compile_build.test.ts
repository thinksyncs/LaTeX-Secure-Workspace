import * as path from 'path'
import * as sinon from 'sinon'
import type { SpawnOptions } from 'child_process'
import * as cs from 'cross-spawn'
import { assert, get, log, mock, set, TextEditor } from './utils'
import { lw } from '../../src/lw'
import { autoBuild, build } from '../../src/compile/build'

describe(path.basename(__filename).split('.')[0] + ':', () => {
    let activeStub: sinon.SinonStub
    let findStub: sinon.SinonStub

    beforeEach(() => {
        mock.init(lw)
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

            assert.pathStrictEqual(spawnStub.getCall(0)?.args?.[2].cwd?.toString(), path.dirname(get.path('main.tex')))
        })

        it('should keep using the resolved main root when subfiles are detected', async () => {
            lw.root.subfiles.path = get.path('subfile.tex')
            lw.root.file.langId = 'latex'

            await build()

            lw.root.subfiles.path = undefined
            lw.root.file.langId = undefined

            assert.hasLog(`Building root file: ${get.path('main.tex')}`)
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
        it('should trigger auto build on save when configured', async () => {
            set.config('latex.autoBuild.run', 'onSave')
            lw.compile.lastAutoBuildTime = 0

            log.start()
            await autoBuild(get.path('main.tex'), 'onSave')
            log.stop()

            assert.hasLog(`Building root file: ${get.path('main.tex')}`)
        })

        it('should start file-change auto build instead of treating it as a disabled secure-build feature', async () => {
            set.config('latex.autoBuild.run', 'onFileChange')
            lw.compile.lastAutoBuildTime = 0

            log.start()
            await autoBuild(get.path('main.tex'), 'onFileChange')
            log.stop()

            assert.hasLog(`Auto build started detecting the change of a file: ${get.path('main.tex')} .`)
            assert.notHasLog('Auto build is disabled in this secure build.')
        })

        it('should debounce auto build according to latex.autoBuild.interval', async () => {
            set.config('latex.autoBuild.run', 'onSave')
            set.config('latex.autoBuild.interval', 1000)
            lw.compile.lastAutoBuildTime = Date.now()

            log.start()
            await autoBuild(get.path('main.tex'), 'onSave')
            log.stop()

            assert.hasLog('Autobuild temporarily disabled.')
            assert.notHasLog('Building root file:')
        })
    })
})
