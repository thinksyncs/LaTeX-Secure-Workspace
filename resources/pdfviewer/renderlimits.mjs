export const PDF_VIEWER_LIMITS = Object.freeze({
    canvasMaxAreaInBytes: 6_000_000,
    documentCleanupDelayMs: 150,
    disableAutoFetch: true,
    disableStream: true,
    enableHWA: false,
    isImageDecoderSupported: false,
    isOffscreenCanvasSupported: false,
    maxCanvasDimension: 3072,
    maxCanvasPixels: 1_500_000,
    maxImageSize: 1_500_000,
    maxOutputScale: 1.25,
    maxRenderRetries: 2,
    maxRenderedPages: 5,
    minOutputScale: 0.1,
    minPlaceholderCanvasSize: 1,
    pageCleanupBatchSize: 4,
    renderMarginMultiplier: 1,
    renderRetryDelayMs: 150,
    useWasm: false,
})

export function createPdfDocumentInit(config, limits = PDF_VIEWER_LIMITS) {
    return {
        cMapPacked: true,
        cMapUrl: config.cMapUrl,
        canvasMaxAreaInBytes: limits.canvasMaxAreaInBytes,
        disableAutoFetch: limits.disableAutoFetch,
        disableStream: limits.disableStream,
        enableHWA: limits.enableHWA,
        isImageDecoderSupported: limits.isImageDecoderSupported,
        isOffscreenCanvasSupported: limits.isOffscreenCanvasSupported,
        maxImageSize: limits.maxImageSize,
        standardFontDataUrl: config.standardFontDataUrl,
        url: config.path,
        useWasm: limits.useWasm,
        wasmUrl: config.wasmUrl,
    }
}

export function computeOutputScale(viewport, devicePixelRatio, limits = PDF_VIEWER_LIMITS) {
    const viewportWidth = Math.max(1, Number(viewport?.width) || 1)
    const viewportHeight = Math.max(1, Number(viewport?.height) || 1)
    const safeDevicePixelRatio = Math.max(1, Number(devicePixelRatio) || 1)
    const deviceScale = Math.min(limits.maxOutputScale, safeDevicePixelRatio)
    const viewportPixels = viewportWidth * viewportHeight
    const pixelScale = Math.sqrt(limits.maxCanvasPixels / viewportPixels)
    const dimensionScale = Math.min(
        limits.maxCanvasDimension / viewportWidth,
        limits.maxCanvasDimension / viewportHeight,
    )

    return Math.max(
        limits.minOutputScale,
        Math.min(deviceScale, pixelScale, dimensionScale),
    )
}

export function enqueueSerialRender(previousRender, render) {
    return Promise.resolve(previousRender).then(render, render)
}

export function getRenderRetryDelay(attempt, limits = PDF_VIEWER_LIMITS) {
    const safeAttempt = Math.max(1, Math.floor(Number(attempt) || 1))
    return limits.renderRetryDelayMs * safeAttempt
}

export function canAttemptPageRender(failures, limits = PDF_VIEWER_LIMITS) {
    const safeFailures = Math.max(0, Math.floor(Number(failures) || 0))
    return safeFailures <= limits.maxRenderRetries
}

export function pickPageNumbersToRender(pageMetrics, viewportTop, viewportHeight, pendingPageNumber, limits = PDF_VIEWER_LIMITS) {
    const safeTop = Number(viewportTop) || 0
    const safeHeight = Math.max(1, Number(viewportHeight) || 1)
    const viewportBottom = safeTop + safeHeight
    const viewportCenter = safeTop + safeHeight / 2
    const margin = safeHeight * limits.renderMarginMultiplier
    const candidates = []
    let nearestPageNumber
    let nearestDistance = Number.POSITIVE_INFINITY

    for (const pageMetric of pageMetrics) {
        const pageTop = Number(pageMetric.pageTop) || 0
        const pageBottom = Math.max(pageTop, Number(pageMetric.pageBottom) || pageTop)
        const pageCenter = (pageTop + pageBottom) / 2
        const distance = Math.abs(pageCenter - viewportCenter)

        candidates.push({
            distance,
            pageNumber: pageMetric.pageNumber,
            visible: pageBottom >= safeTop && pageTop <= viewportBottom,
            near: pageBottom >= safeTop - margin && pageTop <= viewportBottom + margin,
        })

        if (distance < nearestDistance) {
            nearestDistance = distance
            nearestPageNumber = pageMetric.pageNumber
        }
    }

    const nearestIndex = pageMetrics.findIndex(metric => metric.pageNumber === nearestPageNumber)
    const priority = page => page.visible ? 0 : page.pageNumber === pendingPageNumber ? 1 : 2
    const selected = candidates.filter((page, index) => page.near
        || page.pageNumber === pendingPageNumber || Math.abs(index - nearestIndex) <= 2)
        .sort((left, right) => priority(left) - priority(right) || left.distance - right.distance)
        .slice(0, limits.maxRenderedPages)

    // Reserve a slot for a valid pending SyncTeX destination, even at low zoom.
    const pending = candidates.find(page => page.pageNumber === pendingPageNumber)
    if (pending && !selected.some(page => page.pageNumber === pendingPageNumber)) {
        selected[selected.length - 1] = pending
        selected.sort((left, right) => priority(left) - priority(right) || left.distance - right.distance)
    }
    return selected.map(page => page.pageNumber)
}
