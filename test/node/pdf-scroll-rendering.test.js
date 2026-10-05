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
    const f = viewer(['updateVisiblePages'], {
        pageEntries: new Map([1, 2, 3, 4].map(n => [n, { pageNumber: n }])),
        getPagesNearViewport: () => new Set([2, 1, 3]),
        releaseRenderedPage: entry => released.push(entry.pageNumber),
        renderPage: async entry => { rendered.push(entry.pageNumber); f.context.renderRequestVersion++ },
        queueDocumentCleanup: () => assert.fail('Stale batch must stop'),
    })
    t.after(f.restore)
    await f.api.updateVisiblePages(1, 0)
    assert.deepEqual(rendered, [2])
    assert.deepEqual(released, [4])
})

test('page selection preloads two neighbors and prioritizes visible pages', async () => {
    const { pickPageNumbersToRender, PDF_VIEWER_LIMITS } = await limits
    const pages = Array.from({ length: 100 }, (_, i) => ({ pageNumber: i + 1, pageTop: i * 1000, pageBottom: i * 1000 + 980 }))
    assert.deepEqual(pickPageNumbersToRender(pages, 0, 700), [1, 2, 3])
    const middle = pickPageNumbersToRender(pages, 4200, 700)
    assert.equal(middle[0], 5)
    assert.deepEqual([...middle].sort((a, b) => a - b), [3, 4, 5, 6, 7])
    const large = [{ pageNumber: 1, pageTop: 0, pageBottom: 4000 }, { pageNumber: 2, pageTop: 4020, pageBottom: 4120 }]
    assert.equal(pickPageNumbersToRender(large, 3600, 390)[0], 1, 'A nearby small page must not outrank a visible large page')
    for (const zoom of [100, 700, 20000]) {
        const selected = pickPageNumbersToRender(pages, 5000, zoom, 99)
        assert.ok(selected.includes(99))
        assert.ok(selected.length <= PDF_VIEWER_LIMITS.maxRenderedPages)
    }
    assert.deepEqual(pickPageNumbersToRender([], 0, 700, 99), [])
    assert.equal(PDF_VIEWER_LIMITS.maxRenderedPages, 5)
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
