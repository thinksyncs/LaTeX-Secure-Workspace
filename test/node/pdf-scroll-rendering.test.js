'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')
const ts = require('typescript')
const { createClock } = require('@sinonjs/fake-timers')

const source = fs.readFileSync(path.resolve(__dirname, '../../resources/pdfviewer/minimalviewer.js'), 'utf8')
const ast = ts.createSourceFile('minimalviewer.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
const limits = import('../../resources/pdfviewer/renderlimits.mjs')

function deferred() {
    let resolve
    const promise = new Promise(done => { resolve = done })
    return { promise, resolve }
}

// Run the actual viewer functions with controlled browser state and timers.
// This tests scheduling and painting calls, not native VS Code/GPU rendering.
function viewer(names, overrides = {}) {
    const clock = createClock()
    const context = {
        renderEpoch: 1, renderRequestVersion: 0, renderQueueTimer: undefined,
        visibleRenderRunning: false, currentPdf: {}, pageEntries: new Map(),
        renderedPageCache: new Map(),
        setTimeout: clock.setTimeout.bind(clock), clearTimeout: clock.clearTimeout.bind(clock),
        updateVisiblePages: async () => {}, reportError: error => { throw error },
        ...overrides,
    }
    const functions = names.map(name => {
        const node = ast.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name)
        assert.ok(node, name)
        return node.getText(ast)
    }).join('\n')
    const api = vm.runInNewContext(functions + '\n({' + names.join(',') + '})', context)
    return { api, context, clock, restore: () => clock.reset() }
}

test('continuous scrolling paints before scrolling stops', async t => {
    let updates = 0
    const f = viewer(['queueVisiblePageRender'], { updateVisiblePages: async () => { updates++ } })
    t.after(f.restore)
    for (let event = 0; event < 60; event++) {
        f.api.queueVisiblePageRender()
        await f.clock.tickAsync(16)
    }
    assert.ok(updates >= 20, 'A trailing debounce would not paint during these events')
    assert.ok(f.clock.countTimers() <= 1)
})

test('slow rendering coalesces scrolling to one latest serial request', async t => {
    const gate = deferred(), versions = []
    let active = 0, peak = 0
    const f = viewer(['queueVisiblePageRender'], { updateVisiblePages: async (_epoch, version) => {
        versions.push(version)
        peak = Math.max(peak, ++active)
        if (versions.length === 1) await gate.promise
        active--
    } })
    t.after(f.restore)
    f.api.queueVisiblePageRender()
    await f.clock.tickAsync(32)
    for (let event = 0; event < 100; event++) {
        f.api.queueVisiblePageRender()
        await f.clock.tickAsync(16)
    }
    assert.equal(versions.length, 1)
    assert.equal(f.clock.countTimers(), 0)
    gate.resolve()
    await f.clock.tickAsync(64)
    assert.equal(versions.length, 2)
    assert.equal(peak, 1)
    assert.ok(versions[1] >= 101)
    assert.equal(f.clock.countTimers(), 0)
})

test('failed render batches do not block later scroll updates', async t => {
    let calls = 0
    const errors = []
    const f = viewer(['queueVisiblePageRender'], {
        updateVisiblePages: async () => { if (++calls === 1) throw new Error('controlled failure') },
        reportError: error => errors.push(error.message),
    })
    t.after(f.restore)
    f.api.queueVisiblePageRender()
    await f.clock.tickAsync(32)
    f.api.queueVisiblePageRender()
    await f.clock.tickAsync(32)
    assert.equal(calls, 2)
    assert.deepEqual(errors, ['controlled failure'])
    assert.equal(f.context.visibleRenderRunning, false)
})

test('a viewport change stops stale prefetch after the active page', async t => {
    const rendered = [], released = []
    const f = viewer(['updateVisiblePages', 'touchCachedPages'], {
        pageEntries: new Map([1, 2, 3, 4].map(n => [n, { pageNumber: n }])),
        getPagesNearViewport: () => new Set([2, 1, 3]),
        releaseRenderedPage: entry => released.push(entry.pageNumber),
        renderPage: async entry => { rendered.push(entry.pageNumber); f.context.renderRequestVersion++ },
        queueDocumentCleanup: () => assert.fail('Stale batch must stop'),
    })
    t.after(f.restore)
    await f.api.updateVisiblePages(1, 0)
    assert.deepEqual(rendered, [2])
    assert.deepEqual(released, [], 'Leaving the prefetch range alone must not evict a page')
})

test('page selection preloads four neighbors and prioritizes visible pages', async () => {
    const { pickPageNumbersToRender, PDF_VIEWER_LIMITS } = await limits
    const pages = Array.from({ length: 100 }, (_, i) => ({ pageNumber: i + 1, pageTop: i * 1000, pageBottom: i * 1000 + 980 }))
    assert.deepEqual(pickPageNumbersToRender(pages, 0, 700), [1, 2, 3, 4, 5])
    const middle = pickPageNumbersToRender(pages, 4200, 700)
    assert.equal(middle[0], 5)
    assert.deepEqual([...middle].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9])
    const large = [{ pageNumber: 1, pageTop: 0, pageBottom: 4000 }, { pageNumber: 2, pageTop: 4020, pageBottom: 4120 }]
    assert.equal(pickPageNumbersToRender(large, 3600, 390)[0], 1, 'A nearby small page must not outrank a visible large page')
    for (const zoom of [100, 700, 20000]) {
        const selected = pickPageNumbersToRender(pages, 5000, zoom, 99)
        assert.ok(selected.includes(99))
        assert.ok(selected.length <= PDF_VIEWER_LIMITS.maxRenderedPages)
    }
    assert.deepEqual(pickPageNumbersToRender([], 0, 700, 99), [])
    assert.equal(PDF_VIEWER_LIMITS.maxRenderedPages, 20)
    assert.equal(PDF_VIEWER_LIMITS.maxCachedCanvasBytes, 120_000_000)
    assert.equal(PDF_VIEWER_LIMITS.prefetchPageRadius, 4)
    assert.equal(PDF_VIEWER_LIMITS.maxCanvasPixels, 1_500_000)
})

function opaqueCanvas() {
    const context = {
        fillStyle: '#000000', pixel: '#000000',
        fillRect() { this.pixel = this.fillStyle }, scale() {},
    }
    let width = 600, height = 800
    const canvas = {
        classList: { add() {}, remove() {} }, style: {},
        getContext: () => context,
        get width() { return width }, set width(value) { width = value; context.pixel = '#000000' },
        get height() { return height }, set height(value) { height = value; context.pixel = '#000000' },
    }
    return { canvas, context }
}

test('released opaque canvas is painted white, not left black under CSS', async t => {
    const { PDF_VIEWER_LIMITS } = await limits
    const f = viewer(['resetCanvasToPlaceholder'], { PDF_VIEWER_LIMITS })
    t.after(f.restore)
    const { canvas, context } = opaqueCanvas()
    for (let cycle = 0; cycle < 3; cycle++) {
        f.api.resetCanvasToPlaceholder(canvas, { width: 600, height: 800 })
        assert.equal(canvas.width, 1)
        assert.equal(canvas.height, 1)
        assert.equal(canvas.style.height, '800px')
        assert.equal(context.pixel, '#ffffff')
    }
})

test('resized canvas is white before asynchronous PDF painting begins', async t => {
    const { canvas, context } = opaqueCanvas()
    const f = viewer(['renderPage'], {
        canAttemptPageRender: () => true, getOutputScale: () => 1,
        reservePageCanvas: () => true,
        currentPdf: { getPage: async () => ({ render: () => {
            assert.equal(context.pixel, '#ffffff')
            return { promise: Promise.resolve() }
        }, cleanup() {} }) },
        resetRenderFailure() {}, applyPendingSyncTeX() {},
    })
    t.after(f.restore)
    const entry = { canvas, pageNumber: 1, viewport: { width: 600, height: 800 } }
    await f.api.renderPage(entry, 1, 0)
    assert.equal(entry.isRendered, true)
    assert.equal(entry.isRendering, false)
})

for (const change of ['renderEpoch', 'renderRequestVersion']) {
    test(`late page load cannot paint after ${change} changes`, async t => {
        const gate = deferred()
        let cleaned = 0
        const f = viewer(['renderPage'], {
            currentPdf: { getPage: () => gate.promise }, canAttemptPageRender: () => true,
        })
        t.after(f.restore)
        const entry = { pageNumber: 1 }
        const work = f.api.renderPage(entry, 1, 0)
        f.context[change]++
        gate.resolve({ cleanup() { cleaned++ } })
        await work
        assert.equal(entry.isRendered, undefined)
        assert.equal(entry.isRendering, false)
        assert.equal(cleaned, 1)
    })
}

async function cacheFixture(overrides = {}) {
    const { PDF_VIEWER_LIMITS, getRenderRetryDelay } = await limits
    const paints = [], errors = []
    const f = viewer([
        'updateVisiblePages', 'renderPage', 'touchCachedPages', 'reservePageCanvas',
        'discardPageCanvas', 'releaseRenderedPage', 'resetCanvasToPlaceholder',
        'resetRenderFailure', 'clearPageEntries',
    ], {
        PDF_VIEWER_LIMITS, getRenderRetryDelay,
        canAttemptPageRender: failures => failures <= PDF_VIEWER_LIMITS.maxRenderRetries,
        getOutputScale: () => 1, applyPendingSyncTeX() {}, queueDocumentCleanup() {},
        getPagesNearViewport: () => new Set(), statusText: {}, queueVisiblePageRender() {},
        isRenderCancellation: error => error.name === 'RenderingCancelledException',
        reportPageRenderError: error => errors.push(error),
        currentPdf: { getPage: async pageNumber => ({
            render: () => { paints.push(pageNumber); return { promise: Promise.resolve() } },
            cleanup() {},
        }) },
        ...overrides,
    })
    const add = (pageNumber, width = 600, height = 800) => {
        const { canvas } = opaqueCanvas()
        const entry = {
            pageNumber, canvas, viewport: { width, height },
            isRendered: false, isRendering: false, renderFailures: 0,
            shell: { classList: { add() {}, remove() {} } }, retryButton: { hidden: true },
        }
        f.api.resetCanvasToPlaceholder(canvas, entry.viewport)
        f.context.pageEntries.set(pageNumber, entry)
        return entry
    }
    const update = async pageNumbers => {
        f.context.getPagesNearViewport = () => new Set(pageNumbers)
        await f.api.updateVisiblePages(f.context.renderEpoch, f.context.renderRequestVersion)
        assert.deepEqual(errors, [])
    }
    const bytes = () => [...f.context.renderedPageCache.values()].reduce((sum, page) => sum + page.bytes, 0)
    return { ...f, add, update, paints, bytes }
}

test('scrolling keeps 20 recent pages and returning reuses their canvases', async t => {
    const f = await cacheFixture()
    t.after(f.restore)
    const { pickPageNumbersToRender } = await limits
    const pages = Array.from({ length: 50 }, (_, i) => {
        f.add(i + 1)
        return { pageNumber: i + 1, pageTop: i * 1000, pageBottom: i * 1000 + 980 }
    })
    for (let current = 1; current <= 30; current++) {
        await f.update(pickPageNumbersToRender(pages, (current - 1) * 1000, 700))
        assert.ok(f.context.renderedPageCache.size <= 20)
        assert.ok(f.bytes() <= 120_000_000)
    }
    assert.equal(f.context.renderedPageCache.size, 20)
    const count = f.paints.length
    await f.update(pickPageNumbersToRender(pages, 28000, 700))
    assert.equal(f.paints.length, count, 'Backward scroll inside the cache must not repaint')
    const recentlyUsed = f.context.pageEntries.get(29)
    await f.update([50])
    assert.equal(recentlyUsed.isRendered, true, 'Recently revisited page must survive LRU eviction')
    const evicted = f.context.pageEntries.get(1)
    assert.equal(evicted.isRendered, false)
    assert.equal(evicted.canvas.width, 1)
    assert.equal(evicted.canvas.getContext('2d').pixel, '#ffffff')
    await f.update([1])
    assert.equal(f.paints.filter(n => n === 1).length, 2, 'Evicted pages must render again on demand')
})

test('canvas byte budget can evict before 20 pages without evicting higher priorities', async t => {
    const { PDF_VIEWER_LIMITS } = await limits
    const f = await cacheFixture({ PDF_VIEWER_LIMITS: { ...PDF_VIEWER_LIMITS, maxCachedCanvasBytes: 6_000_000 } })
    t.after(f.restore)
    for (let n = 1; n <= 5; n++) f.add(n)
    await f.update([1, 2, 3, 4])
    assert.deepEqual(f.paints, [1, 2, 3])
    assert.equal(f.context.pageEntries.get(4).canvas.width, 1)
    assert.equal(f.bytes(), 5_760_000)
    await f.update([5, 1])
    assert.equal(f.context.renderedPageCache.size, 3)
    assert.equal(f.context.pageEntries.get(1).isRendered, true)
    assert.equal(f.context.pageEntries.get(3).isRendered, false, 'Lowest priority old page is evicted first')
    assert.equal(f.bytes(), 5_760_000)
})

test('visible page can displace lower-priority cached prefetch under byte pressure', async t => {
    const { PDF_VIEWER_LIMITS } = await limits
    const f = await cacheFixture({ PDF_VIEWER_LIMITS: { ...PDF_VIEWER_LIMITS, maxCachedCanvasBytes: 6_000_000 } })
    t.after(f.restore)
    f.add(1, 1000, 1000)
    f.add(2)
    f.add(3)
    await f.update([2, 3])
    await f.update([1, 2, 3])
    assert.equal(f.context.pageEntries.get(1).isRendered, true)
    assert.equal(f.context.pageEntries.get(2).isRendered, true)
    assert.equal(f.context.pageEntries.get(3).isRendered, false)
    assert.ok(f.bytes() <= 6_000_000)
})

test('an individually over-budget canvas is never allocated', async t => {
    const f = await cacheFixture()
    t.after(f.restore)
    const entry = f.add(1, 10000, 10000)
    await f.update([1])
    assert.equal(entry.canvas.width, 1)
    assert.equal(entry.isRendering, false)
    assert.equal(f.paints.length, 0)
    assert.equal(f.bytes(), 0)
})

for (const name of ['Error', 'RenderingCancelledException']) {
    test(`${name} releases the in-flight cache reservation`, async t => {
        const error = new Error('controlled render failure')
        error.name = name
        const f = await cacheFixture({ currentPdf: { getPage: async () => ({
            render: () => ({ promise: Promise.reject(error) }), cleanup() {},
        }) } })
        t.after(f.restore)
        const entry = f.add(1)
        await f.update([1])
        assert.equal(f.context.renderedPageCache.size, 0)
        assert.equal(f.bytes(), 0)
        assert.equal(entry.canvas.width, 1)
        assert.equal(entry.isRendered, false)
        assert.equal(entry.renderFailures, name === 'Error' ? 1 : 0)
    })
}

test('reload or zoom clears retained canvases and late rendering cannot restore them', async t => {
    const f = await cacheFixture()
    t.after(f.restore)
    const first = f.add(1), second = f.add(2)
    await f.update([1, 2])
    const gate = deferred(), started = deferred()
    let cancelled = false
    f.context.currentPdf = { getPage: async () => ({
        render: () => { started.resolve(); return { promise: gate.promise, cancel() { cancelled = true } } },
        cleanup() {},
    }) }
    const third = f.add(3)
    const pending = f.update([3])
    await started.promise
    assert.equal(f.context.renderedPageCache.size, 3, 'Active render is included in the budget')
    f.context.renderEpoch++
    f.api.clearPageEntries()
    assert.equal(cancelled, true)
    assert.equal(f.context.pageEntries.size, 0)
    assert.equal(f.bytes(), 0)
    for (const entry of [first, second, third]) assert.equal(entry.canvas.width, 1)
    gate.resolve()
    await pending
    assert.equal(f.context.renderedPageCache.size, 0)
    assert.equal(third.isRendered, false)
})
