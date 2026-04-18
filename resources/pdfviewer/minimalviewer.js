import {
    createPdfDocumentInit,
    PDF_VIEWER_LIMITS,
    computeOutputScale,
    pickPageNumbersToRender,
} from './renderlimits.mjs'

const vscode = acquireVsCodeApi()
const configElement = document.getElementById('pdf-preview-config')
const statusText = document.getElementById('statusText')
const viewerContainer = document.getElementById('viewerContainer')
const pagesRoot = document.getElementById('pages')

const config = JSON.parse(configElement?.dataset.config ?? '{}')
const state = {
    path: config.path,
    pdfFileUri: config.path,
    scale: config.defaults?.scale ?? config.appearance?.scale ?? 'page-width',
    trim: config.appearance?.trim,
    scrollMode: config.appearance?.scrollMode,
    spreadMode: config.appearance?.spreadMode,
}

let pdfjsLibPromise
let renderEpoch = 0
let currentPdf = undefined
let renderQueueTimer = undefined
let resizeTimer = undefined
let stateTimer = undefined
let synctexIndicatorTimer = undefined
let documentCleanupTimer = undefined
let pendingSyncTeX = undefined
const pageEntries = new Map()
const reverseSyncTeXKeybinding = config.appearance?.keybindings?.synctex ?? 'ctrl-click'

window.addEventListener('message', (event) => {
    const message = event.data
    if (message?.type === 'reload') {
        void renderDocument({ preserveScroll: true })
        return
    }
    if (message?.type === 'synctex') {
        pendingSyncTeX = normalizeSyncTeXData(message.data)
        applyPendingSyncTeX()
    }
})

viewerContainer.addEventListener('scroll', () => {
    queueStatePost()
    queueVisiblePageRender()
}, { passive: true })

window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
        void renderDocument({ preserveScroll: true })
    }, 150)
})

void initialize()

async function initialize() {
    try {
        applyAppearance()
        await renderDocument({ preserveScroll: false })
        vscode.postMessage({ type: 'initialized' })
    } catch (error) {
        reportError(error)
    }
}

async function loadPdfJs() {
    pdfjsLibPromise ??= (async () => {
        const module = await import(config.pdfjsSrc)
        await configureWorker(module)
        return module
    })()
    return pdfjsLibPromise
}

async function configureWorker(pdfjsLib) {
    if (pdfjsLib.GlobalWorkerOptions.workerPort) {
        return
    }
    const result = await fetch(config.workerSrc)
    const blob = await result.blob()
    const blobUrl = URL.createObjectURL(blob)
    pdfjsLib.GlobalWorkerOptions.workerPort = new Worker(blobUrl, { type: 'module' })
}

function applyAppearance() {
    const appearance = config.appearance ?? {}
    const palette = appearance.codeColorTheme === 'dark' ? appearance.color?.dark : appearance.color?.light
    const viewerBackground = palette?.backgroundColor || '#1e1e1e'
    const pageBackground = palette?.pageColorsBackground || '#ffffff'
    const pageBorder = palette?.pageBorderColor || 'rgba(128, 128, 128, 0.35)'

    document.documentElement.style.setProperty('--viewer-background', viewerBackground)
    document.documentElement.style.setProperty('--page-background', pageBackground)
    document.documentElement.style.setProperty('--page-border', pageBorder)

    if (appearance.invertMode?.enabled) {
        const invert = (appearance.invertMode.invert ?? 0) / 100
        const grayscale = (appearance.invertMode.grayscale ?? 0) / 100
        const sepia = (appearance.invertMode.sepia ?? 0) / 100
        const brightness = (appearance.invertMode.brightness ?? 100) / 100
        const hueRotate = appearance.invertMode.hueRotate ?? 0
        viewerContainer.style.filter = `invert(${invert}) grayscale(${grayscale}) sepia(${sepia}) hue-rotate(${hueRotate}deg) brightness(${brightness})`
    }
}

async function renderDocument({ preserveScroll }) {
    const epoch = ++renderEpoch
    const previousScrollTop = viewerContainer.scrollTop
    const previousScrollLeft = viewerContainer.scrollLeft
    clearTimeout(renderQueueTimer)
    clearTimeout(documentCleanupTimer)
    clearPageEntries()
    pagesRoot.replaceChildren()
    statusText.textContent = 'Loading PDF…'

    try {
        currentPdf?.cleanup?.()
        if (currentPdf?.destroy) {
            await currentPdf.destroy()
        }
    } catch (_error) {
    }
    currentPdf = undefined

    const pdfjsLib = await loadPdfJs()
    const loadingTask = pdfjsLib.getDocument(createPdfDocumentInit(config))
    const pdf = await loadingTask.promise
    if (epoch !== renderEpoch) {
        await pdf.destroy()
        return
    }

    currentPdf = pdf
    statusText.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}`
    await buildPageShells(pdf, epoch)
    if (epoch !== renderEpoch) {
        return
    }

    if (preserveScroll) {
        viewerContainer.scrollTop = previousScrollTop
        viewerContainer.scrollLeft = previousScrollLeft
    }

    queueVisiblePageRender()
    applyPendingSyncTeX()
    queueStatePost()
    vscode.postMessage({ type: 'document-loaded' })
}

async function buildPageShells(pdf, epoch) {
    const fragment = document.createDocumentFragment()

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        if (epoch !== renderEpoch) {
            return
        }

        const page = await pdf.getPage(pageNumber)
        try {
            const unitViewport = page.getViewport({ scale: 1 })
            const viewport = page.getViewport({ scale: resolveScale(unitViewport) })
            const entry = createPageEntry(pageNumber, viewport)
            pageEntries.set(pageNumber, entry)
            fragment.append(entry.shell)
        } finally {
            page.cleanup?.()
        }

        if (pageNumber % PDF_VIEWER_LIMITS.pageCleanupBatchSize === 0) {
            await pdf.cleanup?.()
        }
    }

    pagesRoot.append(fragment)
    await pdf.cleanup?.()
}

function createPageEntry(pageNumber, viewport) {
    const shell = document.createElement('section')
    shell.className = 'pageShell'
    shell.dataset.pageNumber = String(pageNumber)

    const label = document.createElement('div')
    label.className = 'pageLabel'
    label.textContent = `Page ${pageNumber}`

    const canvasWrap = document.createElement('div')
    canvasWrap.className = 'pageCanvasWrap'

    const canvas = document.createElement('canvas')
    canvas.className = 'pageCanvas'
    resetCanvasToPlaceholder(canvas, viewport)

    const synctexIndicator = document.createElement('div')
    synctexIndicator.className = 'synctexIndicator'

    canvasWrap.append(canvas, synctexIndicator)
    shell.append(label, canvasWrap)
    installReverseSyncTeXHandlers(canvasWrap, viewport, pageNumber)

    return {
        canvas,
        canvasWrap,
        isRendered: false,
        isRendering: false,
        pageNumber,
        renderTask: undefined,
        shell,
        synctexIndicator,
        viewport,
    }
}

async function renderPage(entry, epoch) {
    if (!currentPdf || entry.isRendered || entry.isRendering || epoch !== renderEpoch) {
        return
    }

    entry.isRendering = true
    const page = await currentPdf.getPage(entry.pageNumber)

    try {
        const outputScale = getOutputScale(entry.viewport)
        entry.canvas.classList.remove('pageCanvasPlaceholder')
        entry.canvas.width = Math.max(1, Math.ceil(entry.viewport.width * outputScale))
        entry.canvas.height = Math.max(1, Math.ceil(entry.viewport.height * outputScale))
        entry.canvas.style.width = `${Math.ceil(entry.viewport.width)}px`
        entry.canvas.style.height = `${Math.ceil(entry.viewport.height)}px`

        const context = entry.canvas.getContext('2d', { alpha: false })
        if (!context) {
            throw new Error(`Unable to acquire a 2D canvas context for page ${entry.pageNumber}.`)
        }
        context.scale(outputScale, outputScale)

        entry.renderTask = page.render({
            canvasContext: context,
            viewport: entry.viewport,
            intent: 'display',
        })
        await entry.renderTask.promise

        if (epoch !== renderEpoch) {
            return
        }

        entry.isRendered = true
        applyPendingSyncTeX()
    } catch (error) {
        if (!isRenderCancellation(error)) {
            throw error
        }
    } finally {
        entry.renderTask = undefined
        entry.isRendering = false
        page.cleanup?.()
    }
}

function installReverseSyncTeXHandlers(canvasWrap, viewport, pageNumber) {
    canvasWrap.addEventListener('click', (event) => {
        if (reverseSyncTeXKeybinding !== 'ctrl-click') {
            return
        }
        if (!(event.ctrlKey || event.metaKey)) {
            return
        }
        event.preventDefault()
        postReverseSyncTeX(event, canvasWrap, viewport, pageNumber)
    })

    canvasWrap.addEventListener('dblclick', (event) => {
        if (reverseSyncTeXKeybinding !== 'double-click') {
            return
        }
        event.preventDefault()
        postReverseSyncTeX(event, canvasWrap, viewport, pageNumber)
    })
}

function postReverseSyncTeX(event, canvasWrap, viewport, pageNumber) {
    const rect = canvasWrap.getBoundingClientRect()
    const offsetX = event.clientX - rect.left
    const offsetY = event.clientY - rect.top
    const pos = viewport.convertToPdfPoint(offsetX, offsetY)

    vscode.postMessage({
        type: 'reverse_synctex',
        page: pageNumber,
        pos,
        textBeforeSelection: '',
        textAfterSelection: '',
    })
}

function resolveScale(viewport) {
    const requestedScale = String(state.scale || 'page-width').trim().toLowerCase()
    const padding = 48
    const availableWidth = Math.max(240, viewerContainer.clientWidth - padding)
    const availableHeight = Math.max(240, viewerContainer.clientHeight - 80)

    if (requestedScale === 'page-fit') {
        return Math.min(availableWidth / viewport.width, availableHeight / viewport.height)
    }
    if (requestedScale === 'page-width' || requestedScale === 'auto') {
        return availableWidth / viewport.width
    }
    if (requestedScale.endsWith('%')) {
        const parsed = Number.parseFloat(requestedScale.slice(0, -1))
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed / 100
        }
    }

    const parsed = Number.parseFloat(requestedScale)
    if (Number.isFinite(parsed) && parsed > 0) {
        return parsed
    }
    return availableWidth / viewport.width
}

function getOutputScale(viewport) {
    return computeOutputScale(viewport, window.devicePixelRatio || 1)
}

function queueVisiblePageRender() {
    clearTimeout(renderQueueTimer)
    renderQueueTimer = setTimeout(() => {
        void updateVisiblePages(renderEpoch)
    }, 50)
}

async function updateVisiblePages(epoch) {
    if (epoch !== renderEpoch || !currentPdf || pageEntries.size === 0) {
        return
    }

    const targetPageNumbers = getPagesNearViewport()
    for (const [pageNumber, entry] of pageEntries) {
        if (!targetPageNumbers.has(pageNumber)) {
            releaseRenderedPage(entry)
        }
    }

    for (const pageNumber of targetPageNumbers) {
        if (epoch !== renderEpoch) {
            return
        }
        const entry = pageEntries.get(pageNumber)
        if (!entry) {
            continue
        }
        await renderPage(entry, epoch)
    }

    queueDocumentCleanup(epoch)
}

function getPagesNearViewport() {
    const top = viewerContainer.scrollTop
    const height = Math.max(1, viewerContainer.clientHeight)
    const pendingPageNumber = getPendingPageNumber()
    const pageMetrics = [...pageEntries.entries()].map(([pageNumber, entry]) => ({
        pageBottom: entry.shell.offsetTop + entry.shell.offsetHeight,
        pageNumber,
        pageTop: entry.shell.offsetTop,
    }))
    return new Set(pickPageNumbersToRender(pageMetrics, top, height, pendingPageNumber))
}

function releaseRenderedPage(entry) {
    if (!entry.isRendered && !entry.isRendering) {
        return
    }

    entry.renderTask?.cancel?.()
    entry.renderTask = undefined
    entry.isRendered = false
    entry.isRendering = false
    resetCanvasToPlaceholder(entry.canvas, entry.viewport)
}

function clearPageEntries() {
    for (const entry of pageEntries.values()) {
        releaseRenderedPage(entry)
    }
    pageEntries.clear()
}

function queueDocumentCleanup(epoch = renderEpoch) {
    clearTimeout(documentCleanupTimer)
    documentCleanupTimer = setTimeout(() => {
        void cleanupDocumentIfIdle(epoch)
    }, PDF_VIEWER_LIMITS.documentCleanupDelayMs)
}

async function cleanupDocumentIfIdle(epoch) {
    if (epoch !== renderEpoch || !currentPdf) {
        return
    }
    for (const entry of pageEntries.values()) {
        if (entry.isRendering) {
            queueDocumentCleanup(epoch)
            return
        }
    }
    try {
        await currentPdf.cleanup?.()
    } catch (_error) {
    }
}

function resetCanvasToPlaceholder(canvas, viewport) {
    canvas.classList.add('pageCanvasPlaceholder')
    canvas.width = PDF_VIEWER_LIMITS.minPlaceholderCanvasSize
    canvas.height = PDF_VIEWER_LIMITS.minPlaceholderCanvasSize
    canvas.style.width = `${Math.ceil(viewport.width)}px`
    canvas.style.height = `${Math.ceil(viewport.height)}px`
}

function queueStatePost() {
    clearTimeout(stateTimer)
    stateTimer = setTimeout(() => {
        vscode.setState({
            ...state,
            scrollTop: viewerContainer.scrollTop,
            scrollLeft: viewerContainer.scrollLeft,
        })
        vscode.postMessage({
            type: 'state',
            state: {
                ...state,
                scrollTop: viewerContainer.scrollTop,
                scrollLeft: viewerContainer.scrollLeft,
            }
        })
    }, 75)
}

function pickSyncTeXRecord(data) {
    if (Array.isArray(data)) {
        return data[0]
    }
    if (typeof data === 'object' && data !== null) {
        return data
    }
    return undefined
}

function getPendingPageNumber() {
    const record = pickSyncTeXRecord(pendingSyncTeX)
    if (!record || typeof record.page !== 'number') {
        return undefined
    }
    return record.page
}

function normalizeSyncTeXData(data) {
    if (Array.isArray(data)) {
        return data.filter(isSyncTeXRecord)
    }
    if (isSyncTeXRecord(data)) {
        return data
    }
    return undefined
}

function isSyncTeXRecord(value) {
    return typeof value === 'object'
        && value !== null
        && typeof value.page === 'number'
        && typeof value.x === 'number'
        && typeof value.y === 'number'
}

function applyPendingSyncTeX() {
    const record = pickSyncTeXRecord(pendingSyncTeX)
    if (!record) {
        return
    }
    const renderedPage = pageEntries.get(record.page)
    if (!renderedPage) {
        return
    }

    const point = renderedPage.viewport.convertToViewportPoint(record.x, record.y)
    const targetLeft = Math.max(0, renderedPage.shell.offsetLeft + renderedPage.canvas.offsetLeft + point[0] - viewerContainer.clientWidth / 2)
    const targetTop = Math.max(0, renderedPage.shell.offsetTop + renderedPage.canvas.offsetTop + point[1] - viewerContainer.clientHeight * 0.35)

    viewerContainer.scrollLeft = targetLeft
    viewerContainer.scrollTop = targetTop
    queueStatePost()
    queueVisiblePageRender()

    if (record.indicator && renderedPage.isRendered) {
        flashSyncTeXIndicator(renderedPage.synctexIndicator, point[0], point[1])
        pendingSyncTeX = undefined
        return
    }

    if (!record.indicator) {
        pendingSyncTeX = undefined
    }
}

function flashSyncTeXIndicator(indicator, left, top) {
    indicator.style.left = `${left}px`
    indicator.style.top = `${top}px`
    indicator.classList.add('active')
    clearTimeout(synctexIndicatorTimer)
    synctexIndicatorTimer = setTimeout(() => {
        indicator.classList.remove('active')
    }, 1200)
}

function reportError(error) {
    const message = error instanceof Error ? error.message : String(error)
    statusText.textContent = 'Failed to load PDF'
    vscode.postMessage({ type: 'document-error', message })
}

function isRenderCancellation(error) {
    return Boolean(error) && (
        error.name === 'RenderingCancelledException'
        || error.name === 'AbortException'
        || /cancel/i.test(String(error.message ?? error))
    )
}
