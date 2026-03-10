import { patchViewerUI, registerKeyBind, registerPersistentState, repositionAnnotation } from './components/gui.js'
import * as utils from './components/utils.js'
import { sendLog, sendPanel } from './components/connection.js'

import type { PdfjsEventName, PDFViewerApplicationType, PDFViewerApplicationOptionsType } from './components/interface.js'
import { initTrim, setTrimCSS } from './components/trimming.js'
import { doneRefresh, restoreState } from './components/refresh.js'
import { initUploadState, setParams, uploadState } from './components/state.js'

declare const PDFViewerApplication: PDFViewerApplicationType
declare const PDFViewerApplicationOptions: PDFViewerApplicationOptionsType

// The 'webviewerloaded' event is fired just before the initialization of PDF.js.
// We can set PDFViewerApplicationOptions at the time.
// - https://github.com/mozilla/pdf.js/wiki/Third-party-viewer-usage#initialization-promise
// - https://github.com/mozilla/pdf.js/pull/10318
const webViewerLoaded = new Promise<void>((resolve) => {
    document.addEventListener('webviewerloaded', () => resolve() )

    // https://github.com/James-Yu/LaTeX-Workshop/pull/4220#issuecomment-2034520751
    try {
        parent.document.addEventListener('webviewerloaded', () => resolve() )
    } catch(_) { /* do nothing */ }
})

// For the details of the initialization of PDF.js,
// see https://github.com/mozilla/pdf.js/wiki/Third-party-viewer-usage
// We should use only the promises provided by PDF.js here, not the ones defined by us,
// to avoid deadlock.
async function getViewerEventBus() {
    await webViewerLoaded
    await PDFViewerApplication.initializedPromise
    return PDFViewerApplication.eventBus
}

function onPDFViewerEvent(event: PdfjsEventName, cb: (evt?: any) => unknown, option?: { once: boolean }): { dispose: () => void } {
    const cb0 = (evt?: unknown) => {
        cb(evt)
        if (option?.once) { PDFViewerApplication.eventBus.off(event, cb0) }
    }
    void getViewerEventBus().then(eventBus => eventBus.on(event, cb0))
    return { dispose: () => PDFViewerApplication.eventBus.off(event, cb0) }
}

async function initialization() {
    sendLog('[viewer] initialization:start')
    document.title = utils.parseURL().docTitle

    const params = await utils.getParams()
    sendLog('[viewer] params:loaded')
    document.addEventListener('webviewerloaded', () => {
        const color = utils.isPrefersColorSchemeDark(params.codeColorTheme) ? params.color.dark : params.color.light
        const options = {
            annotationEditorMode: -1,
            disablePreferences: true,
            enableScripting: false,
            // Resolve assets from bundled pdfjs-dist in extension node_modules.
            cMapUrl: '../node_modules/pdfjs-dist/cmaps/',
            standardFontDataUrl: '../node_modules/pdfjs-dist/standard_fonts/',
            wasmUrl: '../node_modules/pdfjs-dist/wasm/',
            sidebarViewOnLoad: 0,
            workerSrc: '../node_modules/pdfjs-dist/build/pdf.worker.mjs',
            sandboxBundleSrc: '../node_modules/pdfjs-dist/build/pdf.sandbox.mjs',
            forcePageColors: true,
            // The following allow clear display with large zoom values. This is necessary to enable trimming.
            maxCanvasPixels: -1,
            maxCanvasDim: -1,
            enableDetailCanvas: false,
            ...color
        }
        PDFViewerApplicationOptions.setAll(options)
    })
    await patchViewerUI()
    sendLog('[viewer] ui:patched')
    registerKeyBind()
    sendLog('[viewer] keybind:registered')
}

function errorToMessage(error: unknown, fallback: string): string {
    if (error instanceof Error) {
        return error.stack || error.message
    }
    if (typeof error === 'string') {
        return error
    }
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
        return error.message
    }
    return fallback
}

window.addEventListener('error', (event) => {
    const message = errorToMessage(event.error, event.message || 'unknown viewer error')
    sendLog(`[viewer:error] ${message}`)
})

window.addEventListener('unhandledrejection', (event) => {
    const message = errorToMessage(event.reason, 'unknown rejection')
    sendLog(`[viewer:unhandledrejection] ${message}`)
})

await initialization()
sendLog('[viewer] initialization:done')
onPDFViewerEvent('documentloaded', () => {
    sendLog('[viewer] event:documentloaded')
    void setParams()
    initUploadState()
    void getViewerEventBus().then(eventbus => {
        const events: PdfjsEventName[] = ['scalechanged', 'zoomin', 'zoomout', 'zoomreset', 'scrollmodechanged', 'spreadmodechanged', 'pagenumberchanged']
        events.forEach(event => {
            eventbus.on(event, () => { uploadState() })
        })
    })
}, { once: true })
onPDFViewerEvent('pagesinit', () => {
    sendLog('[viewer] event:pagesinit')
    initTrim()
    void restoreState()
    registerPersistentState()
})
onPDFViewerEvent('pagesloaded', () => {
    sendLog('[viewer] event:pagesloaded')
    initTrim()
    void restoreState()
        .then(() => uploadState())
    repositionAnnotation()
    doneRefresh()
})
onPDFViewerEvent('rotationchanging', () => setTrimCSS())

try {
    sendLog('[viewer] import:viewer.mjs:start')
    // @ts-ignore Must import viewer.mjs here, otherwise some config won't work. #4096
    await import('../../viewer/viewer.mjs')
    sendLog('[viewer] import:viewer.mjs:done')
    await PDFViewerApplication.initializedPromise
    sendPanel({ type: 'initialized' })
    sendLog('[viewer] app:initialized')
} catch (error) {
    const message = error instanceof Error ? (error.stack || error.message) : String(error)
    sendLog(`[viewer] import:viewer.mjs:error ${message}`)
    throw error
}

try {
    const { pdfFileUri } = utils.parseURL()
    await PDFViewerApplication.initializedPromise
    const app = PDFViewerApplication as unknown as {
        pdfDocument?: unknown,
        open: (args: { url: string, originalUrl?: string }) => Promise<void>
    }
    if (!app.pdfDocument) {
        sendLog(`[viewer] open:explicit ${pdfFileUri}`)
        await app.open({ url: pdfFileUri, originalUrl: pdfFileUri })
        sendLog('[viewer] open:explicit:done')
    }
} catch (error) {
    const message = error instanceof Error ? (error.stack || error.message) : String(error)
    sendLog(`[viewer] open:explicit:error ${message}`)
}
