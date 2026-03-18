const vscode = acquireVsCodeApi()
const configElement = document.getElementById('pdf-preview-config')
const statusText = document.getElementById('statusText')
const viewerContainer = document.getElementById('viewerContainer')
const pagesRoot = document.getElementById('pages')
const zoomOutButton = document.getElementById('zoomOutButton')
const zoomResetButton = document.getElementById('zoomResetButton')
const zoomInButton = document.getElementById('zoomInButton')
const zoomFitWidthButton = document.getElementById('zoomFitWidthButton')

const config = JSON.parse(configElement?.dataset.config ?? '{}')
const persistedState = vscode.getState() ?? {}
const ZOOM_STEPS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]
const state = {
    path: config.path,
    pdfFileUri: config.path,
    scale: persistedState.scale ?? config.defaults?.scale ?? config.appearance?.scale ?? 'page-width',
    trim: config.appearance?.trim,
    scrollMode: config.appearance?.scrollMode,
    spreadMode: config.appearance?.spreadMode,
}

let pdfjsLibPromise
let renderEpoch = 0
let currentPdf = undefined
let resizeTimer = undefined
let stateTimer = undefined
let synctexIndicatorTimer = undefined
let pendingSyncTeX = undefined
let resolvedScale = 1
const renderedPages = new Map()

window.addEventListener('message', (event) => {
    const message = event.data
    if (message?.type === 'reload') {
        void renderDocument({ preserveScroll: true })
    }
    if (message?.type === 'synctex') {
        pendingSyncTeX = message.data
        void applyPendingSyncTeX()
    }
})

viewerContainer.addEventListener('scroll', () => {
    queueStatePost()
}, { passive: true })

window.addEventListener('resize', () => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
        void renderDocument({ preserveScroll: true })
    }, 150)
})

zoomOutButton?.addEventListener('click', () => {
    void stepZoom('out')
})

zoomResetButton?.addEventListener('click', () => {
    void setZoom('100%')
})

zoomInButton?.addEventListener('click', () => {
    void stepZoom('in')
})

zoomFitWidthButton?.addEventListener('click', () => {
    void setZoom('page-width')
})

void initialize()

async function initialize() {
    try {
        applyAppearance()
        await renderDocument({ preserveScroll: false })
        restorePersistedScrollPosition()
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
    const previousScrollAnchor = preserveScroll ? captureScrollAnchor() : undefined
    renderedPages.clear()
    pagesRoot.replaceChildren()
    statusText.textContent = 'Loading PDF…'

    try {
        if (currentPdf?.destroy) {
            await currentPdf.destroy()
        }
    } catch (_error) {
    }
    currentPdf = undefined

    const pdfjsLib = await loadPdfJs()
    const loadingTask = pdfjsLib.getDocument({
        url: config.path,
        cMapPacked: true,
        cMapUrl: config.cMapUrl,
        standardFontDataUrl: config.standardFontDataUrl,
        wasmUrl: config.wasmUrl,
    })
    const pdf = await loadingTask.promise
    if (epoch !== renderEpoch) {
        await pdf.destroy()
        return
    }

    currentPdf = pdf
    statusText.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'}`

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        if (epoch !== renderEpoch) {
            return
        }
        const pageShell = await renderPage(pdf, pageNumber)
        pagesRoot.append(pageShell)
    }

    restoreScrollAnchor(previousScrollAnchor)

    applyPendingSyncTeX()
    updateZoomUi()
    queueStatePost()
    vscode.postMessage({ type: 'document-loaded' })
}

async function renderPage(pdf, pageNumber) {
    const page = await pdf.getPage(pageNumber)
    const unitViewport = page.getViewport({ scale: 1 })
    const scale = resolveScale(unitViewport)
    if (pageNumber === 1) {
        resolvedScale = scale
    }
    const viewport = page.getViewport({ scale })
    const outputScale = window.devicePixelRatio || 1

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
    canvas.width = Math.ceil(viewport.width * outputScale)
    canvas.height = Math.ceil(viewport.height * outputScale)
    canvas.style.width = `${Math.ceil(viewport.width)}px`
    canvas.style.height = `${Math.ceil(viewport.height)}px`

    const synctexIndicator = document.createElement('div')
    synctexIndicator.className = 'synctexIndicator'

    const context = canvas.getContext('2d', { alpha: false })
    context.scale(outputScale, outputScale)

    await page.render({
        canvasContext: context,
        viewport,
        intent: 'display',
    }).promise

    canvasWrap.append(canvas, synctexIndicator)
    shell.append(label, canvasWrap)
    renderedPages.set(pageNumber, {
        canvas,
        shell,
        synctexIndicator,
        viewport,
    })
    return shell
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

async function setZoom(nextScale) {
    state.scale = nextScale
    await renderDocument({ preserveScroll: true })
}

async function stepZoom(direction) {
    const currentScale = resolvedScale > 0 ? resolvedScale : 1
    const nextScale = direction === 'in'
        ? findNextZoomStep(currentScale)
        : findPreviousZoomStep(currentScale)
    await setZoom(formatZoomScale(nextScale))
}

function findNextZoomStep(scale) {
    return ZOOM_STEPS.find((step) => step > scale + 0.01) ?? clampZoomScale(scale + 0.25)
}

function findPreviousZoomStep(scale) {
    const reversed = [...ZOOM_STEPS].reverse()
    return reversed.find((step) => step < scale - 0.01) ?? clampZoomScale(scale - 0.25)
}

function clampZoomScale(scale) {
    return Math.min(3, Math.max(0.5, scale))
}

function formatZoomScale(scale) {
    return `${Math.round(clampZoomScale(scale) * 100)}%`
}

function updateZoomUi() {
    if (!zoomResetButton || !zoomFitWidthButton) {
        return
    }

    zoomResetButton.textContent = `${Math.round(resolvedScale * 100)}%`
    const requestedScale = String(state.scale || '').trim().toLowerCase()
    const isFitWidth = requestedScale === 'page-width' || requestedScale === 'auto'
    zoomFitWidthButton.classList.toggle('active', isFitWidth)
}

function restorePersistedScrollPosition() {
    if (typeof persistedState.scrollTop === 'number') {
        viewerContainer.scrollTop = persistedState.scrollTop
    }
    if (typeof persistedState.scrollLeft === 'number') {
        viewerContainer.scrollLeft = persistedState.scrollLeft
    }
    queueStatePost()
}

function captureScrollAnchor() {
    const maxScrollTop = Math.max(0, viewerContainer.scrollHeight - viewerContainer.clientHeight)
    const maxScrollLeft = Math.max(0, viewerContainer.scrollWidth - viewerContainer.clientWidth)
    return {
        scrollTop: viewerContainer.scrollTop,
        scrollLeft: viewerContainer.scrollLeft,
        topRatio: maxScrollTop > 0 ? viewerContainer.scrollTop / maxScrollTop : 0,
        leftRatio: maxScrollLeft > 0 ? viewerContainer.scrollLeft / maxScrollLeft : 0,
    }
}

function restoreScrollAnchor(anchor) {
    if (!anchor) {
        return
    }
    const maxScrollTop = Math.max(0, viewerContainer.scrollHeight - viewerContainer.clientHeight)
    const maxScrollLeft = Math.max(0, viewerContainer.scrollWidth - viewerContainer.clientWidth)
    viewerContainer.scrollTop = maxScrollTop > 0 ? anchor.topRatio * maxScrollTop : anchor.scrollTop
    viewerContainer.scrollLeft = maxScrollLeft > 0 ? anchor.leftRatio * maxScrollLeft : anchor.scrollLeft
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

function applyPendingSyncTeX() {
    const record = pickSyncTeXRecord(pendingSyncTeX)
    if (!record) {
        return
    }
    const renderedPage = renderedPages.get(record.page)
    if (!renderedPage) {
        return
    }

    const point = renderedPage.viewport.convertToViewportPoint(record.x, record.y)
    const targetLeft = Math.max(0, renderedPage.shell.offsetLeft + renderedPage.canvas.offsetLeft + point[0] - viewerContainer.clientWidth / 2)
    const targetTop = Math.max(0, renderedPage.shell.offsetTop + renderedPage.canvas.offsetTop + point[1] - viewerContainer.clientHeight * 0.35)

    viewerContainer.scrollLeft = targetLeft
    viewerContainer.scrollTop = targetTop
    queueStatePost()

    if (record.indicator) {
        flashSyncTeXIndicator(renderedPage.synctexIndicator, point[0], point[1])
    }
    pendingSyncTeX = undefined
}

function pickSyncTeXRecord(data) {
    if (!data) {
        return undefined
    }
    if (Array.isArray(data)) {
        return data[0]
    }
    return data
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
