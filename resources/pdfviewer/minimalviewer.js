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
let resizeTimer = undefined
let stateTimer = undefined
let synctexIndicatorTimer = undefined
let pendingSyncTeX = undefined
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

    if (preserveScroll) {
        viewerContainer.scrollTop = previousScrollTop
        viewerContainer.scrollLeft = previousScrollLeft
    }

    applyPendingSyncTeX()
    queueStatePost()
    vscode.postMessage({ type: 'document-loaded' })
}

async function renderPage(pdf, pageNumber) {
    const page = await pdf.getPage(pageNumber)
    const unitViewport = page.getViewport({ scale: 1 })
    const scale = resolveScale(unitViewport)
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
