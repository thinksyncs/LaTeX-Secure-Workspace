'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')
const ts = require('typescript')
const sinon = require('sinon')
const { EventEmitter, once } = require('node:events')
const { spawn } = require('node:child_process')
const { PassThrough } = require('node:stream')
const noop = () => {}
const logger = { log: noop, logError: noop }
const workspacePath = path.resolve('/workspace')
const main = path.join(workspacePath, 'main.tex')
const other = path.join(workspacePath, 'other.tex')

function deferred() {
    let resolve, reject
    const promise = new Promise((yes, no) => { resolve = yes; reject = no })
    return { promise, resolve, reject }
}

// Execute production TypeScript with controlled I/O completion order.
function load(file, stubs, expose = '') {
    const filename = path.resolve(__dirname, '../..', file)
    const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
        fileName: filename,
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true }
    }).outputText
    const mod = { exports: {} }
    vm.runInNewContext(output + (expose ? `\nmodule.exports.testOnly = {${expose}};` : ''), {
        module: mod, exports: mod.exports, __dirname: path.dirname(filename),
        require: name => Object.hasOwn(stubs, name) ? stubs[name] : require(name),
        process, Buffer, console, Date, setTimeout, clearTimeout, setInterval, clearInterval
    }, { filename })
    return mod.exports
}

function uri(file) {
    return { fsPath: file, path: file, scheme: 'file', toString: () => 'file://' + file, with: () => uri(file) }
}
function editor(file, text = '\\documentclass{article}') {
    return { document: { fileName: file, uri: uri(file), languageId: 'latex', getText: () => text } }
}

function rootFixture(realpath = async file => file, resolveFile = async () => undefined) {
    const workspace = { uri: uri(workspacePath) }
    const vscode = { window: { activeTextEditor: editor(main) }, workspace: {
        workspaceFolders: [workspace], getWorkspaceFolder: () => workspace,
        getConfiguration: () => ({ get: key => key === 'latex.rootFile.indicator' ? '\\documentclass[]{}' : false })
    } }
    const changes = [], flsLoads = []
    const lw = { log: () => logger, watcher: { src: { onDelete: noop } },
        constant: { FILE_URI_SCHEMES: ['file'] },
        file: { hasAlwaysRootExt: () => false, getLangId: () => 'latex', toUri: uri },
        outline: { refresh: noop }, completion: { input: { reset: noop } }, lint: { label: { reset: noop } },
        cache: { reset: noop, add: noop, refreshCache: async () => {}, loadFlsFile: async file => { flsLoads.push(file) } },
        event: { RootFileChanged: 'changed', fire: (type, value) => { if (type === 'changed') changes.push(value) } }
    }
    const { root } = load('src/core/root.ts', { vscode, fs: { ...fs, promises: { realpath } }, '../lw': { lw },
        '../utils/inputfilepath': {}, '../utils/utils': { stripCommentsAndVerbatim: text => text, resolveFile } })
    return { root, vscode, lw, changes, flsLoads }
}

for (const rejectOld of [false, true]) {
    test(`stale root containment ${rejectOld ? 'failure' : 'success'} cannot replace the latest root`, async () => {
        const entered = deferred(), release = deferred()
        const { root, vscode, changes } = rootFixture(async file => {
            if (file === main) { entered.resolve(); await release.promise }
            return rejectOld && file === main ? path.resolve('/outside/main.tex') : file
        })
        const first = root.resolveSecurityRoot()
        await entered.promise
        vscode.window.activeTextEditor = editor(other)
        assert.equal(await root.resolveSecurityRoot(), other)
        release.resolve()
        await first
        assert.equal(root.file.path, other)
        assert.deepEqual(changes, [other])
    })
}

for (const method of ['find', 'resolveSecurityRoot']) {
    test(`${method} discards stale subfile state`, async () => {
        const entered = deferred(), release = deferred()
        const { root, vscode } = rootFixture(undefined, async () => { entered.resolve(); return release.promise })
        vscode.window.activeTextEditor = editor(main, '\\documentclass[parent.tex]{subfiles}')
        const first = root[method]()
        await entered.promise
        vscode.window.activeTextEditor = editor(other)
        await root[method]()
        release.resolve(path.join(workspacePath, 'parent.tex'))
        await first
        assert.equal(root.file.path, other)
        assert.equal(root.subfiles.path, undefined)
    })
}

test('a root refresh that finishes after a switch cannot start old FLS loading', async () => {
    const release = deferred()
    const { root, vscode, lw, flsLoads } = rootFixture()
    lw.cache.refreshCache = file => file === main ? release.promise : Promise.resolve()
    await root.resolveSecurityRoot()
    vscode.window.activeTextEditor = editor(other)
    await root.resolveSecurityRoot()
    release.resolve()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(flsLoads, [other])
})

test('finding the same root does not cancel its pending FLS load', async () => {
    const release = deferred()
    const { root, lw, flsLoads } = rootFixture()
    lw.cache.refreshCache = () => release.promise
    await root.resolveSecurityRoot()
    await root.resolveSecurityRoot()
    release.resolve()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(flsLoads, [main])
})

function cacheFixture(t) {
    const applied = [], watched = new Set(), events = []
    let onDelete
    const watcher = { onChange: noop, onDelete: cb => { onDelete = cb }, reset: () => watched.clear(),
        add: value => watched.add(value.fsPath), has: value => watched.has(value.fsPath) }
    const completion = {}
    for (const name of ['citation', 'usepackage', 'reference', 'glossary', 'environment', 'macro', 'subsuperscript']) {
        completion[name] = { parse: cache => { if (name === 'reference') applied.push(cache.content) } }
    }
    completion.input = { parseGraphicsPath: noop }
    const lw = { log: () => logger, watcher: { src: watcher, bib: watcher, glossary: watcher }, onDispose: noop,
        file: { hasTeXExt: () => true, read: async () => 'NEW', exists: async () => true, toUri: uri,
            getBibPath: async () => [], getFlsPath: async () => undefined, getAuxDir: () => workspacePath },
        root: { file: { path: main } }, parser: { parse: { tex: async () => ({}) } },
        lint: { label: { check: noop } }, event: { FileParsed: 'parsed', fire: (...args) => events.push(args) },
        outline: { reconstruct: noop }, completion }
    const config = { 'latex.watch.files.ignore': [], 'latex.texDirs': [],
        'intellisense.update.aggressive.enabled': true, 'intellisense.update.delay': 100 }
    const input = { exec: async () => undefined }
    const vscode = { workspace: { textDocuments: [], getConfiguration: () => ({ get: key => config[key] }) } }
    const { cache } = load('src/core/cache.ts', { vscode, '../lw': { lw },
        '../utils/utils': { stripCommentsAndVerbatim: text => text },
        '../utils/inputfilepath': { InputFileRegExp: class { exec(...args) { return input.exec(...args) } } } })
    t.after(() => cache.reset())
    return { cache, lw, applied, watched, events, input, remove: file => onDelete(uri(file)) }
}

test('a slow old read cannot overwrite newer content or completions', async t => {
    const { cache, lw, applied } = cacheFixture(t)
    const entered = deferred(), release = deferred()
    lw.file.read = () => { entered.resolve(); return release.promise }
    const first = cache.refreshCache(main)
    assert.equal(cache.promises.has(main), true, 'reads must be tracked immediately')
    await entered.promise
    lw.file.read = async () => 'NEW'
    await cache.refreshCache(main)
    release.resolve('OLD')
    await first
    assert.equal(cache.get(main).content, 'NEW')
    assert.deepEqual(applied, ['NEW'])
})

test('an old parse cannot delete the newer pending promise or release its waiter', async t => {
    const { cache, lw } = cacheFixture(t)
    const firstParse = deferred(), secondParse = deferred(), firstEntered = deferred(), secondEntered = deferred()
    let parses = 0
    lw.parser.parse.tex = () => {
        if (++parses === 1) { firstEntered.resolve(); return firstParse.promise }
        secondEntered.resolve(); return secondParse.promise
    }
    const first = cache.refreshCache(main)
    await firstEntered.promise
    const second = cache.refreshCache(main)
    await secondEntered.promise
    let waited = false
    const waiter = cache.wait(main).then(() => { waited = true })
    const pending = cache.promises.get(main)
    firstParse.resolve({})
    await first
    assert.equal(cache.promises.get(main), pending)
    assert.equal(waited, false)
    secondParse.resolve({})
    await Promise.all([second, waiter])
    assert.equal(cache.promises.size, 0)
})

for (const invalidate of ['reset', 'delete']) {
    test(`${invalidate} invalidates in-flight cache reads`, async t => {
        const { cache, lw, applied, remove, events } = cacheFixture(t)
        const entered = deferred(), release = deferred()
        lw.file.read = () => { entered.resolve(); return release.promise }
        const pending = cache.refreshCache(main)
        await entered.promise
        if (invalidate === 'reset') cache.reset()
        else remove(main)
        release.resolve('OLD')
        await pending
        assert.equal(cache.paths().length, 0)
        assert.equal(cache.promises.size, 0)
        assert.deepEqual(applied, [])
        assert.deepEqual(events, [])
    })
}

test('reset during input resolution does not resurrect watches or child caches', async t => {
    const { cache, input, watched } = cacheFixture(t)
    const entered = deferred(), release = deferred()
    input.exec = () => { entered.resolve(); return release.promise }
    const pending = cache.refreshCache(main)
    await entered.promise
    cache.reset()
    release.resolve({ path: other, match: { index: 0 } })
    await pending
    assert.equal(cache.paths().length, 0)
    assert.equal(watched.size, 0)
})

test('reset while package parsing waits prevents late completion side effects', async t => {
    const { cache, lw, applied } = cacheFixture(t)
    const entered = deferred(), release = deferred()
    lw.completion.usepackage.parse = () => { entered.resolve(); return release.promise }
    const pending = cache.refreshCache(main)
    await entered.promise
    cache.reset()
    release.resolve()
    await pending
    assert.deepEqual(applied, [])
})

test('cache failure releases bookkeeping and permits a successful retry', async t => {
    const { cache, lw } = cacheFixture(t)
    lw.file.read = async () => { throw new Error('read failed') }
    await cache.refreshCache(main)
    assert.equal(cache.promises.size, 0)
    lw.file.read = async () => 'RECOVERED'
    await cache.refreshCache(main)
    assert.equal(cache.get(main).content, 'RECOVERED')
    assert.equal(cache.promises.size, 0)
})

test('reset cancels debounced refreshes', async t => {
    const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    t.after(() => clock.restore())
    const { cache, lw } = cacheFixture(t)
    await cache.refreshCache(main)
    let reads = 0
    lw.file.read = async () => { reads++; return '' }
    cache.refreshCacheAggressive(main)
    cache.reset()
    await clock.tickAsync(500)
    assert.equal(reads, 0)
    assert.equal(clock.countTimers(), 0)
})

test('reset while FLS reading waits cannot revive old dependencies', async t => {
    const { cache, lw, watched } = cacheFixture(t)
    const entered = deferred(), release = deferred()
    lw.file.getFlsPath = async () => path.join(workspacePath, 'main.fls')
    lw.file.read = () => { entered.resolve(); return release.promise }
    const pending = cache.loadFlsFile(main)
    await entered.promise
    cache.reset()
    release.resolve(`INPUT ${other}\n`)
    await pending
    assert.equal(watched.size, 0)
    assert.equal(cache.paths().length, 0)
})

test('included TeX traversal terminates for a non-root dependency cycle', async t => {
    const { cache } = cacheFixture(t)
    const third = path.join(workspacePath, 'third.tex')
    for (const file of [main, other, third]) await cache.refreshCache(file)
    cache.get(main).children.push({ filePath: other, index: 0 })
    cache.get(other).children.push({ filePath: third, index: 0 })
    cache.get(third).children.push({ filePath: other, index: 0 })
    assert.deepEqual([...cache.getIncludedTeX(main)], [main, other, third])
})

function watcherFixture(t) {
    const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    t.after(() => clock.restore())
    const changes = [], deleted = []
    const vscode = { RelativePattern: class {}, workspace: {
        getConfiguration: () => ({ get: () => 10 }),
        createFileSystemWatcher: () => ({ onDidCreate: noop, onDidChange: noop, onDidDelete: noop, dispose: noop })
    } }
    const lw = { log: () => logger, onDispose: noop, event: { fire: noop },
        file: { hasBinaryExt: () => true, exists: async () => false }, external: { stat: async () => ({size: 1}) } }
    const { watcher } = load('src/core/watcher.ts', { vscode, '../lw': { lw } })
    t.after(() => watcher.src.reset())
    const src = watcher.src, file = uri(path.join(workspacePath, 'main.pdf'))
    src.onChange(value => changes.push(value.fsPath))
    src.onDelete(value => deleted.push(value.fsPath))
    src.add(file)
    return { src, file, clock, lw, changes, deleted }
}

test('concurrent binary changes reserve one polling slot and timer', async t => {
    const { src, file, clock, lw, changes } = watcherFixture(t)
    const release = deferred()
    let reads = 0
    lw.external.stat = () => { reads++; return release.promise }
    const first = src.onDidChange('change', file)
    const second = src.onDidChange('change', file)
    release.resolve({size: 1})
    await Promise.all([first, second])
    assert.equal(reads, 1)
    assert.equal(clock.countTimers(), 1)
    await clock.tickAsync(250)
    assert.deepEqual(changes, [file.fsPath])
    assert.equal(clock.countTimers(), 0)
})

test('reset during the first stat cannot start a timer afterward', async t => {
    const { src, file, clock, lw, changes } = watcherFixture(t)
    const release = deferred()
    lw.external.stat = () => release.promise
    const pending = src.onDidChange('change', file)
    src.reset()
    release.resolve({size: 1})
    await pending
    await clock.tickAsync(500)
    assert.equal(clock.countTimers(), 0)
    assert.equal(Object.keys(src.polling).length, 0)
    assert.deepEqual(changes, [])
})

test('reset cancels active polling and stale ticks cannot remove a replacement', async t => {
    const { src, file, clock, lw, changes } = watcherFixture(t)
    await src.onDidChange('change', file)
    const release = deferred()
    let reads = 0
    lw.external.stat = () => { reads++; return release.promise }
    await clock.tickAsync(40)
    assert.equal(reads, 1, 'polling stats must not overlap')
    src.reset()
    assert.equal(clock.countTimers(), 0)
    src.add(file)
    lw.external.stat = async () => ({size: 2})
    await src.onDidChange('change', file)
    release.reject(new Error('old stat failed'))
    await clock.tickAsync(250)
    assert.deepEqual(changes, [file.fsPath])
    assert.equal(clock.countTimers(), 0)
})

test('a stale deletion check cannot dispose the replacement watch', async t => {
    const { src, file, clock, lw, deleted } = watcherFixture(t)
    const release = deferred()
    lw.file.exists = () => release.promise
    const pending = src.onDidDelete(file)
    await clock.tickAsync(10)
    src.reset()
    src.add(file)
    release.resolve(false)
    await pending
    await clock.tickAsync(1)
    assert.equal(src.has(file), true)
    assert.deepEqual(deleted, [])
})

test('confirmed deletion notifies once and releases the folder watch', async t => {
    const { src, file, clock, deleted } = watcherFixture(t)
    const pending = src.onDidDelete(file)
    await clock.tickAsync(20)
    await pending
    assert.deepEqual(deleted, [file.fsPath])
    assert.equal(Boolean(src.has(file)), false)
    assert.equal(clock.countTimers(), 0)
})

function pdfFixture(t) {
    const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    t.after(() => clock.restore())
    let html = async () => '<html>viewer</html>'
    let watchers = 0, watcherDisposals = 0, messageDisposals = 0, panelDisposals = 0
    const callbacks = {}, posts = []
    let dispose = noop
    const panel = { reveal: noop, onDidDispose: cb => { dispose = cb; return { dispose: noop } },
        dispose: () => { panelDisposals++; dispose() }, webview: { html: '',
            onDidReceiveMessage: () => ({dispose: () => { messageDisposals++ }}),
            postMessage: async msg => { posts.push(msg); return true } } }
    const vscode = { Uri: { parse: value => uri(value) }, workspace: { createFileSystemWatcher: () => {
        watchers++
        return { dispose: () => { watcherDisposals++ },
            onDidChange: cb => { callbacks.change = cb; return {dispose: noop} },
            onDidCreate: cb => { callbacks.create = cb; return {dispose: noop} },
            onDidDelete: cb => { callbacks.delete = cb; return {dispose: noop} } }
    } } }
    const lw = { log: () => logger, viewer: { getParams: () => ({}) }, event: { fire: noop },
        external: { stat: async () => ({size: 1}) } }
    const pdf = load('src/preview/pdfcustomeditor.ts', { vscode, '../lw': { lw },
        './viewer/securepdfviewer': { configureSecurePdfViewerWebview: noop, getSecurePdfViewerHtml: () => html() } })
    t.after(() => pdf.resetCustomEditorStateForTest())
    const file = uri(path.join(workspacePath, 'main.pdf'))
    const resolve = () => new pdf.SecurePdfCustomEditorProvider().resolveCustomEditor({uri: file}, panel)
    return { pdf, file, panel, callbacks, clock, lw, posts, resolve, setHtml: value => { html = value },
        counts: () => ({watchers, watcherDisposals, messageDisposals, panelDisposals}) }
}

test('closing a PDF during HTML loading does not resurrect its state or watcher', async t => {
    const f = pdfFixture(t), release = deferred()
    f.setHtml(() => release.promise)
    const pending = f.resolve()
    f.panel.dispose()
    release.resolve('<html>old</html>')
    await pending
    assert.equal(f.panel.webview.html, '')
    assert.equal(f.pdf.getCustomEditorStates(f.file).length, 0)
    assert.equal(f.counts().watchers, 0)
    assert.equal(f.counts().messageDisposals, 1)
})

test('a failed PDF setup releases registered state and handlers', async t => {
    const f = pdfFixture(t)
    f.setHtml(async () => { throw new Error('HTML failed') })
    await assert.rejects(f.resolve(), /HTML failed/)
    assert.equal(f.pdf.getCustomEditorStates(f.file).length, 0)
    assert.equal(f.counts().messageDisposals, 1)
})

test('an old PDF reload cannot replace the latest HTML', async t => {
    const f = pdfFixture(t), release = deferred()
    await f.resolve()
    f.setHtml(() => release.promise)
    const first = f.pdf.reloadCustomEditorPanels(f.file)
    f.setHtml(async () => 'NEW')
    await f.pdf.reloadCustomEditorPanels(f.file)
    release.resolve('OLD')
    await first
    assert.equal(f.panel.webview.html, 'NEW')
    f.panel.dispose()
    assert.equal(f.counts().watcherDisposals, 1)
})

test('PDF recreation invalidates a pending deletion stat', async t => {
    const f = pdfFixture(t), release = deferred()
    await f.resolve()
    f.lw.external.stat = () => release.promise
    f.callbacks.delete()
    await f.clock.tickAsync(300)
    f.callbacks.create()
    release.reject(new Error('old file was missing'))
    await f.clock.tickAsync(1)
    assert.equal(f.counts().panelDisposals, 0)
    f.panel.dispose()
})

test('a PDF reload-message failure is not treated as a missing file', async t => {
    const f = pdfFixture(t)
    await f.resolve()
    f.panel.webview.postMessage = async () => { throw new Error('panel unavailable') }
    f.callbacks.delete()
    await f.clock.tickAsync(301)
    assert.equal(f.counts().panelDisposals, 0)
    f.panel.dispose()
})

test('an old SyncTeX acknowledgement cannot clear the latest request', async t => {
    const f = pdfFixture(t)
    await f.resolve()
    await f.pdf.revealLocationInCustomEditor(f.file, { page: 1, x: 1, y: 1 })
    const first = f.posts.at(-1)
    await f.pdf.revealLocationInCustomEditor(f.file, { page: 2, x: 2, y: 2 })
    const second = f.posts.at(-1)
    await f.pdf.handleCustomEditorMessageForTest(f.file, f.panel, {}, {
        type: 'synctex-applied', requestId: first.requestId, state: {page: 1}
    })
    assert.equal(await f.pdf.deliverPendingSyncTeXForTest(f.file), true)
    assert.equal(f.posts.at(-1).requestId, second.requestId)
    await f.pdf.handleCustomEditorMessageForTest(f.file, f.panel, {}, {
        type: 'synctex-applied', requestId: second.requestId, state: {page: 2}
    })
    assert.equal(await f.pdf.deliverPendingSyncTeXForTest(f.file), false)
    f.panel.dispose()
})

function child() {
    const proc = new EventEmitter()
    proc.stdout = new PassThrough()
    proc.stderr = new PassThrough()
    proc.killCount = 0
    proc.kill = () => { proc.killCount++; return true }
    return proc
}

function lookupFixture(t, spawnChild = child) {
    const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
    t.after(() => clock.restore())
    const children = [], disposables = []
    let command = 'kpsewhich'
    const vscode = { Uri: { file: uri }, workspace: { isTrusted: true, workspaceFolders: [{uri: uri(workspacePath)}],
        getConfiguration: () => ({get: (_key, fallback) => fallback}) } }
    const lw = { log: () => logger, onDispose: value => disposables.push(value), onConfigChange: noop,
        root: { file: {path: main}, dir: {path: workspacePath} } }
    const { file } = load('src/core/file.ts', { vscode, '../lw': {lw}, '../utils/utils': {},
        fs: {...fs, mkdtempSync: () => path.join(workspacePath, 'temp'), mkdirSync: noop, accessSync: noop},
        '../utils/security': { warnWorkspaceCommandSetting: noop, getSecureConfigurationValueSync: () => command,
            confirmWorkspaceCommandExecution: async () => true },
        '../compile/tool-runner': { spawnBuildTool: () => { const proc = spawnChild(); children.push(proc); return proc } } })
    const dispose = () => disposables.forEach(item => item.dispose())
    t.after(dispose)
    return { file, lw, vscode, children, clock, dispose, setCommand: value => { command = value } }
}

test('kpsewhich deduplicates within a context but not across projects or commands', async t => {
    const f = lookupFixture(t)
    const first = f.file.kpsewhich('article.cls'), duplicate = f.file.kpsewhich('article.cls')
    await f.clock.tickAsync(0)
    assert.equal(f.children.length, 1)
    f.children[0].stdout.write('article.cls\n')
    f.children[0].emit('close', 0)
    assert.equal(await first, main.replace('main.tex', 'article.cls'))
    assert.equal(await duplicate, await first)
    assert.equal(await f.file.kpsewhich('article.cls'), await first)
    assert.equal(f.children.length, 1)
    f.lw.root.dir.path = path.join(workspacePath, 'second')
    const second = f.file.kpsewhich('article.cls')
    await f.clock.tickAsync(0)
    assert.equal(f.children.length, 2)
    f.children[1].stdout.write('article.cls\n')
    f.children[1].emit('close', 0)
    assert.equal(await second, path.join(workspacePath, 'second', 'article.cls'))
    f.setCommand('other-kpsewhich')
    const third = f.file.kpsewhich('article.cls')
    await f.clock.tickAsync(0)
    assert.equal(f.children.length, 3)
    f.children[2].emit('close', 1)
    await third
    assert.equal(f.clock.countTimers(), 0)
})

for (const reason of ['timeout', 'output', 'dispose']) {
    test(`kpsewhich ${reason} cancels a pending child and ignores late success`, async t => {
        const f = lookupFixture(t)
        const pending = f.file.kpsewhich('article.cls')
        await f.clock.tickAsync(0)
        if (reason === 'timeout') await f.clock.tickAsync(15000)
        else if (reason === 'output') f.children[0].stdout.write('x'.repeat(1024 * 1024 + 1))
        else f.dispose()
        assert.equal(await pending, undefined)
        assert.equal(f.children[0].killCount, 1)
        f.children[0].stdout.write('stale.cls\n')
        f.children[0].emit('close', 0)
        assert.equal(f.clock.countTimers(), 0)
        const retry = f.file.kpsewhich('article.cls')
        await f.clock.tickAsync(0)
        if (reason === 'dispose') {
            assert.equal(f.children.length, 1)
            assert.equal(await retry, undefined)
        } else {
            assert.equal(f.children.length, 2)
            f.children[1].stdout.write('fresh.cls\n')
            f.children[1].emit('close', 0)
            assert.equal(await retry, path.join(workspacePath, 'fresh.cls'))
        }
    })
}

test('kpsewhich timeout actually terminates its owned OS process', async t => {
    const f = lookupFixture(t, () => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
        stdio: ['ignore', 'pipe', 'pipe']
    }))
    const pending = f.file.kpsewhich('hanging-test.cls')
    await f.clock.tickAsync(0)
    const proc = f.children[0]
    const closed = once(proc, 'close')
    t.after(async () => {
        if (proc.exitCode === null && proc.signalCode === null) proc.kill('SIGKILL')
        await closed
    })
    await f.clock.tickAsync(15000)
    assert.equal(await pending, undefined)
    await closed
    assert.equal(proc.killed, true)
    assert.ok(proc.exitCode !== null || proc.signalCode !== null)
    assert.equal(f.clock.countTimers(), 0)
})

function buildMonitorFixture() {
    const parsed = []
    const lw = { log: () => new Proxy(logger, {get: (target, key) => target[key] ?? noop}),
        watcher: {src: {onChange: noop}, bib: {onChange: noop}}, compile: {process: child()},
        parser: {parse: {log: text => { parsed.push(text); return false }}} }
    const {testOnly} = load('src/compile/build.ts', {vscode: {}, '../lw': {lw}, '../utils/security': {},
        '../utils/tex-environment': {}, './recipe': {}, './queue': {queue: {clear: noop}},
        './local-setup': {}, '../utils/windows-build': {}, './tool-runner': {}}, 'monitorProcess')
    return {lw, parsed, monitor: () => testOnly.monitorProcess({command: 'latexmk', rootFile: main, isExternal: false}, {})}
}

test('build completion waits for final output after exit', async () => {
    const {lw, parsed, monitor} = buildMonitorFixture()
    const proc = lw.compile.process
    let finished = false
    const pending = monitor().then(value => { finished = true; return value })
    proc.stdout.write('first\n')
    proc.emit('exit', 0, null)
    await Promise.resolve()
    assert.equal(finished, false)
    proc.stdout.write('last\n')
    proc.emit('close', 0, null)
    assert.equal(await pending, true)
    assert.deepEqual(parsed, ['first\nlast\n'])
})

test('late close after a build error cannot clear the next process', async () => {
    const {lw, monitor} = buildMonitorFixture()
    const old = lw.compile.process, pending = monitor()
    old.emit('error', new Error('spawn failed'))
    assert.equal(await pending, false)
    const next = child()
    lw.compile.process = next
    old.emit('exit', 0, null)
    old.emit('close', 0, null)
    assert.equal(lw.compile.process, next)
})

test('failed integration hosts release profiles before the top-level exit', async () => {
    let removed = 0, earlyExits = 0
    const hostError = new Error('controlled host failure')
    const {testOnly} = load('test/runTest.ts', {
        process: {platform: process.platform, env: {
            LATEXWORKSHOP_FOREGROUND_TESTS: '1', LATEXWORKSHOP_VSCODE_TEST_PATH: '/test/code'
        }, exit: () => { earlyExits++; throw new Error('premature exit') }},
        tmp: {dirSync: () => ({name: '/test/profile', removeCallback: () => { removed++ }})},
        '@vscode/test-electron': {runTests: async () => { throw hostError }},
        './fixture-selection': {}, './result': {}
    }, 'runTestSuites')
    await assert.rejects(testOnly.runTestSuites('unittest'), error => error === hostError)
    assert.equal(earlyExits, 0)
    assert.equal(removed, 2)
})
