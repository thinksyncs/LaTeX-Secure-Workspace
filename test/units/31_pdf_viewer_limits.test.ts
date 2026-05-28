import * as fs from 'fs'
import * as path from 'path'
import * as vm from 'vm'
import { assert } from './utils'
import { testFileSuiteName } from '../file-name'

type RenderLimitsModule = {
    PDF_VIEWER_LIMITS: {
        canvasMaxAreaInBytes: number,
        documentCleanupDelayMs: number,
        disableAutoFetch: boolean,
        disableStream: boolean,
        enableHWA: boolean,
        isImageDecoderSupported: boolean,
        isOffscreenCanvasSupported: boolean,
        maxCanvasDimension: number,
        maxCanvasPixels: number,
        maxImageSize: number,
        maxOutputScale: number,
        maxRenderedPages: number,
        minOutputScale: number,
        minPlaceholderCanvasSize: number,
        pageCleanupBatchSize: number,
        renderMarginMultiplier: number
    },
    createPdfDocumentInit: (config: {
        cMapUrl: string,
        path: string,
        standardFontDataUrl: string,
        wasmUrl: string
    }) => {
        cMapPacked: boolean,
        cMapUrl: string,
        canvasMaxAreaInBytes: number,
        disableAutoFetch: boolean,
        disableStream: boolean,
        enableHWA: boolean,
        isImageDecoderSupported: boolean,
        isOffscreenCanvasSupported: boolean,
        maxImageSize: number,
        standardFontDataUrl: string,
        url: string,
        useWasm: boolean,
        wasmUrl: string
    },
    computeOutputScale: (viewport: { width: number, height: number }, devicePixelRatio: number) => number,
    pickPageNumbersToRender: (
        pageMetrics: Array<{ pageNumber: number, pageTop: number, pageBottom: number }>,
        viewportTop: number,
        viewportHeight: number,
        pendingPageNumber?: number,
    ) => number[]
}

describe(testFileSuiteName(__filename), () => {
    let renderLimits: RenderLimitsModule

    before(() => {
        const modulePath = path.resolve(__dirname, '../../../resources/pdfviewer/renderlimits.mjs')
        const source = fs.readFileSync(modulePath, 'utf8')
            .replace(/export const PDF_VIEWER_LIMITS =/, 'const PDF_VIEWER_LIMITS =')
            .replace(/export function createPdfDocumentInit/g, 'function createPdfDocumentInit')
            .replace(/export function computeOutputScale/g, 'function computeOutputScale')
            .replace(/export function pickPageNumbersToRender/g, 'function pickPageNumbersToRender')
        const script = new vm.Script(`${source}\nmodule.exports = { PDF_VIEWER_LIMITS, createPdfDocumentInit, computeOutputScale, pickPageNumbersToRender }`)
        const module: { exports: RenderLimitsModule | undefined } = { exports: undefined }
        const context = {
            Math,
            module,
        }

        script.runInNewContext(context)
        assert.ok(module.exports)
        renderLimits = module.exports
    })

    it('should keep conservative hard limits for the PDF viewer renderer', () => {
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.canvasMaxAreaInBytes, 6_000_000)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.documentCleanupDelayMs, 150)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.disableAutoFetch, true)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.disableStream, true)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.enableHWA, false)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.isImageDecoderSupported, false)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.isOffscreenCanvasSupported, false)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.maxCanvasDimension, 3072)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.maxCanvasPixels, 1_500_000)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.maxImageSize, 1_500_000)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.maxRenderedPages, 2)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.maxOutputScale, 1.25)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.minOutputScale, 0.1)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.minPlaceholderCanvasSize, 1)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.pageCleanupBatchSize, 4)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.renderMarginMultiplier, 0)
    })

    it('should disable risky pdf.js features for large documents', () => {
        const init = renderLimits.createPdfDocumentInit({
            cMapUrl: '/cmaps/',
            path: '/tmp/main.pdf',
            standardFontDataUrl: '/standard_fonts/',
            wasmUrl: '/wasm/',
        })

        assert.strictEqual(init.cMapPacked, true)
        assert.strictEqual(init.cMapUrl, '/cmaps/')
        assert.strictEqual(init.canvasMaxAreaInBytes, 6_000_000)
        assert.strictEqual(init.disableAutoFetch, true)
        assert.strictEqual(init.disableStream, true)
        assert.strictEqual(init.enableHWA, false)
        assert.strictEqual(init.isImageDecoderSupported, false)
        assert.strictEqual(init.isOffscreenCanvasSupported, false)
        assert.strictEqual(init.maxImageSize, 1_500_000)
        assert.strictEqual(init.standardFontDataUrl, '/standard_fonts/')
        assert.strictEqual(init.url, '/tmp/main.pdf')
        assert.strictEqual(init.useWasm, false)
        assert.strictEqual(init.wasmUrl, '/wasm/')
    })

    it('should clamp output scale to avoid oversized canvases', () => {
        const scale = renderLimits.computeOutputScale({ width: 12000, height: 9000 }, 2)

        assert.ok(scale <= 0.2561, `Expected very large pages to be clamped aggressively, received ${scale}.`)
        assert.ok(12000 * scale <= renderLimits.PDF_VIEWER_LIMITS.maxCanvasDimension + 1)
        assert.ok(9000 * scale <= renderLimits.PDF_VIEWER_LIMITS.maxCanvasDimension + 1)
    })

    it('should keep pending SyncTeX pages while limiting rendered pages', () => {
        const pages = renderLimits.pickPageNumbersToRender([
            { pageNumber: 1, pageTop: 0, pageBottom: 900 },
            { pageNumber: 2, pageTop: 920, pageBottom: 1820 },
            { pageNumber: 3, pageTop: 1840, pageBottom: 2740 },
        ], 950, 800, 3).sort((left, right) => left - right)

        assert.deepStrictEqual([...pages], [2, 3])
    })

    it('should keep adjacent visible pages rendered while scrolling', () => {
        const pages = renderLimits.pickPageNumbersToRender([
            { pageNumber: 1, pageTop: 0, pageBottom: 900 },
            { pageNumber: 2, pageTop: 920, pageBottom: 1820 },
            { pageNumber: 3, pageTop: 1840, pageBottom: 2740 },
        ], 550, 800).sort((left, right) => left - right)

        assert.deepStrictEqual([...pages], [1, 2])
    })
})
