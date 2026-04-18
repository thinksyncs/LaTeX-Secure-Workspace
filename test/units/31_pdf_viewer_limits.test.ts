import * as fs from 'fs'
import * as path from 'path'
import * as vm from 'vm'
import { assert } from './utils'

type RenderLimitsModule = {
    PDF_VIEWER_LIMITS: {
        maxCanvasDimension: number,
        maxCanvasPixels: number,
        maxOutputScale: number,
        maxRenderedPages: number,
        minOutputScale: number,
        minPlaceholderCanvasSize: number,
        renderMarginMultiplier: number
    },
    computeOutputScale: (viewport: { width: number, height: number }, devicePixelRatio: number) => number,
    pickPageNumbersToRender: (
        pageMetrics: Array<{ pageNumber: number, pageTop: number, pageBottom: number }>,
        viewportTop: number,
        viewportHeight: number,
        pendingPageNumber?: number,
    ) => number[]
}

describe(path.basename(__filename).split('.')[0] + ':', () => {
    let renderLimits: RenderLimitsModule

    before(() => {
        const modulePath = path.resolve(__dirname, '../../../resources/pdfviewer/renderlimits.mjs')
        const source = fs.readFileSync(modulePath, 'utf8')
            .replace(/export const PDF_VIEWER_LIMITS =/, 'const PDF_VIEWER_LIMITS =')
            .replace(/export function computeOutputScale/g, 'function computeOutputScale')
            .replace(/export function pickPageNumbersToRender/g, 'function pickPageNumbersToRender')
        const script = new vm.Script(`${source}\nmodule.exports = { PDF_VIEWER_LIMITS, computeOutputScale, pickPageNumbersToRender }`)
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
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.maxCanvasDimension, 4096)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.maxCanvasPixels, 2_500_000)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.maxRenderedPages, 2)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.maxOutputScale, 1.5)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.minOutputScale, 0.1)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.minPlaceholderCanvasSize, 1)
        assert.strictEqual(renderLimits.PDF_VIEWER_LIMITS.renderMarginMultiplier, 0.25)
    })

    it('should clamp output scale to avoid oversized canvases', () => {
        const scale = renderLimits.computeOutputScale({ width: 12000, height: 9000 }, 2)

        assert.ok(scale <= 0.3414, `Expected very large pages to be clamped aggressively, received ${scale}.`)
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
})
