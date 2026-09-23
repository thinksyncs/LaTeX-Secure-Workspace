import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { createHash } from 'crypto'
import * as sinon from 'sinon'
import * as vscode from 'vscode'
import { assert, mock, set } from './utils'
import { lw } from '../../src/lw'
import * as managed from '../../src/utils/managed-tex'
import { getTinyTexAsset, tinyTexDownloadUrl } from '../../src/utils/tinytex-manifest'
import { requestManagedTexInstall } from '../../src/compile/tex-install'
import { JAPANESE_TEX_SOURCE } from '../../src/utils/japanese-tex-manifest'

describe('36_managed_tex:', () => {
    let temporary: string
    beforeEach(() => {
        temporary = fs.realpathSync(fs.mkdtempSync(path.join(path.resolve(os.tmpdir()), 'lw-managed-tex-unit-')))
    })
    afterEach(() => {
        sinon.restore()
        managed.configureManagedTexStorage(undefined)
        fs.rmSync(temporary, { recursive: true, force: true })
    })

    it('should pin supported assets and reject unsupported OS and architectures', () => {
        for (const [platform, arch, musl] of [
            ['darwin', 'arm64', false], ['darwin', 'x64', false], ['win32', 'x64', false],
            ['linux', 'x64', false], ['linux', 'arm64', false], ['linux', 'x64', true]
        ] as const) {
            const asset = getTinyTexAsset(platform, arch, musl)
            assert.ok(asset)
            assert.match(asset.sha256, /^[a-f0-9]{64}$/)
            assert.ok(asset.bytes > 0)
            assert.ok(tinyTexDownloadUrl(asset).includes('/v2026.09/'))
        }
        assert.strictEqual(getTinyTexAsset('win32', 'arm64'), undefined)
        assert.strictEqual(getTinyTexAsset('linux', 'arm64', true), undefined)
        assert.strictEqual(getTinyTexAsset('linux', 'ia32'), undefined)
        assert.strictEqual(getTinyTexAsset('freebsd', 'x64'), undefined)
    })

    it('should not create storage or run installation during configuration', () => {
        const storage = path.join(temporary, 'storage')
        managed.configureManagedTexStorage(storage)
        assert.strictEqual(managed.getManagedTexBin(), undefined)
        assert.strictEqual(fs.existsSync(storage), false)
    })

    it('should accept local user-data storage but reject remote and virtual providers', () => {
        for (const scheme of ['file', 'vscode-userdata']) {
            assert.strictEqual(managed.resolveManagedTexStorage({ scheme, authority: '', fsPath: temporary }), temporary)
            assert.strictEqual(managed.resolveManagedTexStorage({ scheme, authority: '', fsPath: temporary }, 'ssh-remote'), undefined)
        }
        assert.strictEqual(managed.resolveManagedTexStorage({ scheme: 'vscode-userdata', authority: 'remote', fsPath: temporary }), undefined)
        assert.strictEqual(managed.resolveManagedTexStorage({ scheme: 'memfs', authority: '', fsPath: temporary }), undefined)
        assert.strictEqual(managed.resolveManagedTexStorage({ scheme: 'file', authority: '', fsPath: 'relative' }), undefined)
    })

    it('should restore only a local Windows ASCII storage approval without IO', async () => {
        const chosen = 'C:\\Private TeX'
        const state = { get: <T>() => chosen as T, update: sinon.stub().resolves() }
        managed.configureManagedTexStorage('C:\\Users\\日本語', state, 'win32')
        assert.strictEqual(managed.getManagedTexStorage(), chosen)
        assert.ok(state.update.notCalled)
        assert.ok(managed.usesPrivateTexStorage())
        managed.configureManagedTexStorage(undefined, state, 'win32')
        assert.strictEqual(managed.getManagedTexStorage(), undefined)
        managed.configureManagedTexStorage(temporary, state, 'darwin')
        assert.strictEqual(managed.getManagedTexStorage(), temporary)
        for (const value of ['C:\\', 'relative', '\\\\server\\share', 'C:\\Users\\日本語', 'C:\\USER~1', 'C:\\a\\..\\b']) {
            assert.strictEqual(managed.isWindowsAsciiStorage(value), false)
        }
        await managed.rememberManagedTexStorage(chosen)
        assert.ok(state.update.calledOnceWithExactly('managedTex.privateStorage', chosen))
        assert.strictEqual(managed.getManagedTexStorage(), chosen)
    })

    it('should preserve storage if persisting its explicit approval fails', async () => {
        managed.configureManagedTexStorage(temporary, { get: () => undefined, update: () => Promise.reject(new Error('write failed')) })
        await assert.rejects(managed.rememberManagedTexStorage('C:\\Private'), /write failed/)
        assert.strictEqual(managed.getManagedTexStorage(), temporary)
    })

    it('should keep PATH changes inside the returned child-process environment', () => {
        const original = { PATH: '/usr/bin', KEEP: 'value' }
        assert.deepStrictEqual(managed.texEnvironment('/managed/bin', original, 'linux'), { PATH: '/managed/bin:/usr/bin', KEEP: 'value' })
        assert.deepStrictEqual(original, { PATH: '/usr/bin', KEEP: 'value' })
        assert.deepStrictEqual(managed.texEnvironment('C:\\TeX', { Path: 'C:\\Windows' }, 'win32'), { Path: 'C:\\TeX;C:\\Windows' })
        assert.deepStrictEqual(managed.texEnvironment('C:\\TeX', { PATH: 'first', Path: 'second' }, 'win32'), { PATH: 'C:\\TeX;first' })
    })

    it('should reject binaries, configuration and traversal in Japanese font packages', () => {
        managed.validateJapaneseArchiveListing('fonts/type1/public/ipaex-type1/font.pfb\ntex/latex/cjk/CJK.sty\ndoc/fonts/ipaex-type1/LICENSE\ntlpkg/\ntlpkg/tlpobj/cjk.tlpobj\n')
        for (const entry of ['bin/windows/pdflatex.exe', 'web2c/texmf.cnf', 'tex/../../outside', '/fonts/file', '']) {
            assert.throws(() => managed.validateJapaneseArchiveListing(entry))
        }
    })

    it('should reject traversal and unexpected roots in Unix archive entries', () => {
        managed.validateArchiveListing('TinyTeX/\nTinyTeX/bin/latexmk\n', 'TinyTeX')
        for (const listing of ['', '/TinyTeX/file', 'TinyTeX/../outside', 'other/file', 'TinyTeX/dir\\file']) {
            assert.throws(() => managed.validateArchiveListing(listing, 'TinyTeX'))
        }
    })

    it('should allow only the publisher HTTPS endpoint and its release-asset redirects', () => {
        assert.ok(managed.isAllowedDownloadUrl('https://github.com/rstudio/tinytex-releases/releases/download/v2026.09/file'))
        assert.ok(managed.isAllowedDownloadUrl('https://release-assets.githubusercontent.com/asset'))
        for (const value of ['http://github.com/a', 'https://github.com.evil.test/a', 'https://user:pass@github.com/a', 'https://github.com:444/a', 'file:///tmp/a']) {
            assert.strictEqual(managed.isAllowedDownloadUrl(value), false)
        }
    })

    const payload = Buffer.from('test archive bytes')
    const asset = { ...getTinyTexAsset('darwin', 'x64')!, bytes: payload.length, sha256: createHash('sha256').update(payload).digest('hex') }

    it('should verify the exact downloaded size and digest before returning', async () => {
        const download = path.join(temporary, 'download')
        const fetcher = sinon.stub().resolves(new Response(payload))
        await managed.downloadTinyTex(asset, download, new AbortController().signal, () => {}, fetcher as typeof fetch)
        assert.deepStrictEqual(fs.readFileSync(download), payload)
        assert.strictEqual(fetcher.firstCall.args[1].redirect, 'manual')
    })

    it('should reject bad hashes, oversized and truncated downloads', async () => {
        for (const [index, body] of [Buffer.from('wrong archive data'), Buffer.concat([payload, payload]), payload.subarray(0, 2)].entries()) {
            await assert.rejects(managed.downloadTinyTex(asset, path.join(temporary, `bad-${index}`), new AbortController().signal, () => {},
                sinon.stub().resolves(new Response(body)) as typeof fetch), /size|SHA-256/)
        }
    })

    it('should verify offline bytes without downloading or overwriting', async () => {
        const source = path.join(temporary, 'source')
        const target = path.join(temporary, 'verified')
        fs.writeFileSync(source, payload)
        const network = sinon.stub(globalThis, 'fetch').rejects(new Error('Offline import must not fetch'))
        await managed.copyPinnedAsset(source, target, asset, new AbortController().signal)
        assert.deepStrictEqual(fs.readFileSync(target), payload)
        await assert.rejects(managed.copyPinnedAsset(source, target, asset, new AbortController().signal), /EEXIST/)
        await assert.rejects(managed.copyPinnedAsset(source, path.join(temporary, 'bad-hash'), {...asset, sha256: '0'.repeat(64)}, new AbortController().signal), /SHA-256/)
        await assert.rejects(managed.copyPinnedAsset(source, path.join(temporary, 'bad-size'), {...asset, bytes: 1}, new AbortController().signal), /size/)
        const controller = new AbortController()
        controller.abort()
        await assert.rejects(managed.copyPinnedAsset(source, path.join(temporary, 'cancelled'), asset, controller.signal))
        assert.strictEqual(fs.existsSync(path.join(temporary, 'cancelled')), false)
        assert.ok(network.notCalled)
    })

    it('should fail an incomplete offline bundle without network fallback or a leftover lock', async () => {
        const bundle = path.join(temporary, 'bundle')
        fs.mkdirSync(bundle)
        const network = sinon.stub(globalThis, 'fetch').rejects(new Error('Offline import must not fetch'))
        const storage = path.join(temporary, 'storage')
        await assert.rejects(managed.installManagedTex(storage, {
            offlineDirectory: bundle, signal: new AbortController().signal, progress: () => {}
        }), /ENOENT/)
        assert.ok(network.notCalled)
        assert.deepStrictEqual(fs.readdirSync(storage), [])
    })

    it('should remove only its new bundle after a failed download', async () => {
        const sentinel = path.join(temporary, 'keep.txt')
        fs.writeFileSync(sentinel, 'keep')
        sinon.stub(globalThis, 'fetch').resolves(new Response(payload))
        await assert.rejects(managed.prepareManagedTexBundle(temporary, {
            profile: 'lightweight', signal: new AbortController().signal, progress: () => {}
        }), /size|SHA-256/)
        assert.deepStrictEqual(fs.readdirSync(temporary), ['keep.txt'])
        assert.strictEqual(fs.readFileSync(sentinel, 'utf8'), 'keep')
    })

    it('should reject an unapproved redirect before requesting it', async () => {
        const fetcher = sinon.stub().resolves(new Response(null, { status: 302, headers: { location: 'https://example.invalid/asset' } }))
        await assert.rejects(managed.downloadTinyTex(asset, path.join(temporary, 'download'), new AbortController().signal, () => {}, fetcher as typeof fetch), /approved HTTPS/)
        assert.ok(fetcher.calledOnce)
        assert.strictEqual(fs.existsSync(path.join(temporary, 'download')), false)
    })

    it('should not create an installation when already cancelled', async () => {
        const controller = new AbortController()
        controller.abort()
        const root = path.join(temporary, 'not-created')
        await assert.rejects(managed.installManagedTex(root, { signal: controller.signal, progress: () => {} }))
        assert.strictEqual(fs.existsSync(root), false)
    })

    it('should preserve an incomplete destination without downloading or overwriting it', async () => {
        fs.mkdirSync(path.join(temporary, 'tinytex'))
        fs.writeFileSync(path.join(temporary, 'tinytex', 'keep'), 'existing')
        await assert.rejects(managed.installManagedTex(temporary, { signal: new AbortController().signal, progress: () => {} }), /not overwritten/)
        assert.strictEqual(fs.readFileSync(path.join(temporary, 'tinytex', 'keep'), 'utf8'), 'existing')
    })

    it('should preserve another installation lock', async () => {
        const lock = path.join(temporary, 'tinytex-install.lock')
        fs.mkdirSync(lock)
        await assert.rejects(managed.installManagedTex(temporary, { signal: new AbortController().signal, progress: () => {} }), /Another TeX installation/)
        assert.ok(fs.existsSync(lock))
    })

    it('should release its install lock even if staging cleanup fails', async () => {
        // Unix stops at the first progress callback; Windows stops at the mocked
        // download. Neither path downloads an archive or starts an installer.
        sinon.stub(globalThis, 'fetch').resolves(new Response(null, { status: 503 }))
        sinon.stub(fs.promises, 'rm').rejects(new Error('controlled cleanup failure'))
        await assert.rejects(managed.installManagedTex(temporary, {
            signal: new AbortController().signal,
            progress: () => { throw new Error('controlled installation failure') }
        }), /controlled cleanup failure/)
        assert.strictEqual(fs.existsSync(path.join(temporary, 'tinytex-install.lock')), false)
        assert.strictEqual(fs.existsSync(path.join(temporary, 'tinytex')), false)
    })

    it('should preserve a dangling installation link without downloading', async () => {
        const target = path.join(temporary, 'tinytex')
        fs.symlinkSync(path.join(temporary, 'missing'), target, process.platform === 'win32' ? 'junction' : 'dir')
        await assert.rejects(managed.installManagedTex(temporary, { signal: new AbortController().signal, progress: () => {} }), /not overwritten/)
        assert.ok(fs.lstatSync(target).isSymbolicLink())
    })

    it('should keep an existing recorded version usable across manifest updates', () => {
        const installedAsset = managed.getCurrentTinyTexAsset()!
        const install = path.join(temporary, 'tinytex')
        const bin = path.join(install, 'bin', installedAsset.bin)
        fs.mkdirSync(bin, { recursive: true })
        for (const tool of ['latexmk', 'pdflatex']) {
            fs.writeFileSync(path.join(bin, tool + (process.platform === 'win32' ? '.exe' : '')), 'fixture')
        }
        fs.writeFileSync(path.join(install, '.latex-workspace-install.json'), JSON.stringify({
            platform: process.platform, arch: process.arch, version: 'v2026.08', sha256: 'a'.repeat(64)
        }))
        assert.strictEqual(managed.getManagedTexBin(temporary), bin)
        assert.strictEqual(managed.getManagedTexBin(temporary, 'japanese'), undefined)
    })

    it('should resolve tar from fixed system directories including Alpine bin', () => {
        assert.strictEqual(managed.getSystemTar('linux', candidate => candidate === '/bin/tar'), '/bin/tar')
        assert.strictEqual(managed.getSystemTar('darwin', () => true), '/usr/bin/tar')
        assert.throws(() => managed.getSystemTar('linux', () => false), /System tar/)
    })

    describe('installation consent', () => {
        let source: vscode.CancellationTokenSource
        let install: sinon.SinonStub
        let remote: sinon.SinonStub
        let pick: sinon.SinonStub
        beforeEach(() => {
            mock.init(lw)
            sinon.stub(vscode.workspace, 'isTrusted').value(true)
            sinon.stub(vscode.workspace, 'workspaceFolders').value([{ uri: vscode.Uri.file(temporary), name: 'test', index: 0 }])
            remote = sinon.stub(vscode.env, 'remoteName').value(undefined)
            managed.configureManagedTexStorage(path.join(temporary, 'storage'))
            sinon.stub(managed, 'getCurrentTinyTexAsset').returns(getTinyTexAsset('darwin', 'x64'))
            install = sinon.stub(managed, 'installManagedTex').resolves('/managed/bin')
            const selection = { label: 'Lightweight TeX', profile: 'lightweight' }
            pick = sinon.stub(vscode.window, 'showQuickPick').resolves(selection)
            set.configUpdate((key, value) => { set.config(key, value); return Promise.resolve() })
            source = new vscode.CancellationTokenSource()
            sinon.stub(vscode.window, 'withProgress').callsFake((_options, task) => Promise.resolve(task({ report: () => {} }, source.token)))
            sinon.stub(vscode.window, 'showErrorMessage').resolves(undefined)
        })
        afterEach(() => source.dispose())

        it('should do nothing when profile selection is cancelled', async () => {
            pick.resolves(undefined)
            const prompt = sinon.stub(vscode.window, 'showInformationMessage')
            assert.strictEqual(await requestManagedTexInstall(), false)
            assert.ok(prompt.notCalled)
            assert.ok(install.notCalled)
        })

        it('should disclose and install the selected Japanese profile', async () => {
            pick.resolves({ label: 'Japanese TeX', profile: 'japanese' })
            set.config('security.useManagedTeX', false)
            const updates: string[] = []
            set.configUpdate((key, value, target) => {
                assert.strictEqual(target, vscode.ConfigurationTarget.Global)
                updates.push(key)
                set.config(key, value)
                return Promise.resolve()
            })
            const prompt = sinon.stub(vscode.window, 'showInformationMessage').resolves('Download and Install' as unknown as vscode.MessageItem)
            assert.strictEqual(await requestManagedTexInstall(), true)
            assert.strictEqual(install.firstCall.args[1].profile, 'japanese')
            const detail = (prompt.firstCall.args[1] as vscode.MessageOptions).detail ?? ''
            assert.ok(detail.includes('IPAex'))
            assert.deepStrictEqual(detail.split('\n').filter(line => line.startsWith('https://')), [
                tinyTexDownloadUrl(getTinyTexAsset('darwin', 'x64')!), JAPANESE_TEX_SOURCE
            ])
            assert.ok(detail.includes('tinytex-japanese'))
            assert.deepStrictEqual(updates, ['security.useManagedTeX', 'security.managedTeXProfile'])
        })

        it('should make no installation call when the download prompt is dismissed', async () => {
            const prompt = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined)
            assert.strictEqual(await requestManagedTexInstall(), false)
            assert.ok(install.notCalled)
            const detail = (prompt.firstCall.args[1] as vscode.MessageOptions).detail ?? ''
            assert.ok(detail.includes('SHA-256'))
            assert.ok(detail.includes('storage'))
            assert.ok(detail.includes('No administrator access'))
        })

        it('should install only after the separate explicit download consent', async () => {
            sinon.stub(vscode.window, 'showInformationMessage').resolves('Download and Install' as unknown as vscode.MessageItem)
            assert.strictEqual(await requestManagedTexInstall(), true)
            assert.ok(install.calledOnce)
            assert.pathStrictEqual(install.firstCall.args[0] as string, path.join(temporary, 'storage'))
        })

        it('should not install on a remote extension host', async () => {
            remote.value('ssh-remote')
            const prompt = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined)
            assert.strictEqual(await requestManagedTexInstall(), false)
            assert.ok(install.notCalled)
            assert.ok(String(prompt.firstCall.args[0]).includes('Remote hosts are not modified'))
        })

        it('should not install if cancellation was requested before progress starts', async () => {
            source.cancel()
            sinon.stub(vscode.window, 'showInformationMessage').resolves('Download and Install' as unknown as vscode.MessageItem)
            assert.strictEqual(await requestManagedTexInstall(), false)
            assert.ok(install.notCalled)
        })

        it('should import only after offline consent and pass the selected folder', async () => {
            sinon.stub(vscode.window, 'showOpenDialog').resolves([vscode.Uri.file(temporary)])
            const prompt = sinon.stub(vscode.window, 'showInformationMessage').resolves('Verify and Install Offline' as unknown as vscode.MessageItem)
            assert.strictEqual(await requestManagedTexInstall('import'), true)
            assert.strictEqual(install.firstCall.args[1].offlineDirectory, temporary)
            assert.ok(String((prompt.firstCall.args[1] as vscode.MessageOptions).detail).includes('No download fallback'))
        })

        it('should do nothing if the offline folder dialog is cancelled', async () => {
            sinon.stub(vscode.window, 'showOpenDialog').resolves(undefined)
            const prompt = sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined)
            assert.strictEqual(await requestManagedTexInstall('import'), false)
            assert.ok(install.notCalled)
            assert.ok(prompt.notCalled)
        })

        it('should prepare a bundle without installing or changing settings', async () => {
            sinon.stub(vscode.window, 'showOpenDialog').resolves([vscode.Uri.file(temporary)])
            sinon.stub(vscode.window, 'showInformationMessage').resolves('Download Bundle' as unknown as vscode.MessageItem)
            const prepare = sinon.stub(managed, 'prepareManagedTexBundle').resolves(path.join(temporary, 'bundle'))
            const updates: string[] = []
            set.configUpdate(key => { updates.push(key); return Promise.resolve() })
            assert.strictEqual(await requestManagedTexInstall('prepare'), true)
            assert.ok(prepare.calledOnce)
            assert.ok(install.notCalled)
            assert.deepStrictEqual(updates, [])
        })

        it('should not join an operation with a different consent mode', async () => {
            let release: (value: undefined) => void = () => {}
            pick.returns(new Promise(resolve => { release = resolve }))
            sinon.stub(vscode.window, 'showInformationMessage').resolves(undefined)
            const first = requestManagedTexInstall()
            try {
                assert.strictEqual(await requestManagedTexInstall('import'), false)
                assert.ok(install.notCalled)
            } finally {
                release(undefined)
                assert.strictEqual(await first, false)
            }
        })

        it('should validate private storage and persist only after approved installation', async () => {
            sinon.stub(managed, 'needsPrivateTexStorage').returns(true)
            const validate = sinon.stub(managed, 'validatePrivateTexStorage').resolves()
            const remember = sinon.stub(managed, 'rememberManagedTexStorage').resolves()
            sinon.stub(vscode.window, 'showOpenDialog').resolves([vscode.Uri.file(temporary)])
            const prompt = sinon.stub(vscode.window, 'showInformationMessage')
            prompt.onFirstCall().resolves('Choose Private Folder' as unknown as vscode.MessageItem)
            prompt.onSecondCall().resolves('Download and Install' as unknown as vscode.MessageItem)
            assert.strictEqual(await requestManagedTexInstall(), true)
            assert.ok(validate.calledOnce)
            assert.ok(install.calledAfter(validate))
            assert.ok(remember.calledAfter(install))
            assert.ok(remember.calledOnceWithExactly(temporary))
        })

        it('should reject a private folder without installing or persisting it', async () => {
            sinon.stub(managed, 'needsPrivateTexStorage').returns(true)
            sinon.stub(managed, 'validatePrivateTexStorage').rejects(new Error('Not private'))
            const remember = sinon.stub(managed, 'rememberManagedTexStorage').resolves()
            sinon.stub(vscode.window, 'showOpenDialog').resolves([vscode.Uri.file(temporary)])
            const prompt = sinon.stub(vscode.window, 'showInformationMessage')
            prompt.onFirstCall().resolves('Choose Private Folder' as unknown as vscode.MessageItem)
            prompt.onSecondCall().resolves('Download and Install' as unknown as vscode.MessageItem)
            assert.strictEqual(await requestManagedTexInstall(), false)
            assert.ok(install.notCalled)
            assert.ok(remember.notCalled)
        })

        it('should not save private storage on cancelled consent or failed installation', async () => {
            sinon.stub(managed, 'needsPrivateTexStorage').returns(true)
            sinon.stub(managed, 'validatePrivateTexStorage').resolves()
            const remember = sinon.stub(managed, 'rememberManagedTexStorage').resolves()
            const folder = sinon.stub(vscode.window, 'showOpenDialog').resolves(undefined)
            const prompt = sinon.stub(vscode.window, 'showInformationMessage').resolves('Choose Private Folder' as unknown as vscode.MessageItem)
            assert.strictEqual(await requestManagedTexInstall(), false)
            assert.ok(install.notCalled)
            folder.resolves([vscode.Uri.file(temporary)])
            assert.strictEqual(await requestManagedTexInstall(), false)
            assert.ok(install.notCalled)
            prompt.resetHistory()
            prompt.onSecondCall().resolves('Download and Install' as unknown as vscode.MessageItem)
            install.rejects(new Error('Failed download'))
            assert.strictEqual(await requestManagedTexInstall(), false)
            assert.ok(install.calledOnce)
            assert.ok(remember.notCalled)
        })

        it('should recheck a saved private destination before installation', async () => {
            sinon.stub(managed, 'usesPrivateTexStorage').returns(true)
            const validate = sinon.stub(managed, 'validatePrivateTexStorage').rejects(new Error('Permissions changed'))
            sinon.stub(vscode.window, 'showInformationMessage').resolves('Download and Install' as unknown as vscode.MessageItem)
            assert.strictEqual(await requestManagedTexInstall(), false)
            assert.ok(validate.calledOnce)
            assert.ok(install.notCalled)
        })

        it('should leave a failed installation retryable', async () => {
            sinon.stub(vscode.window, 'showInformationMessage').resolves('Download and Install' as unknown as vscode.MessageItem)
            install.onFirstCall().rejects(new Error('Checksum mismatch'))
            assert.strictEqual(await requestManagedTexInstall(), false)
            assert.strictEqual(await requestManagedTexInstall(), true)
            assert.ok(install.calledTwice)
        })
    })
})
