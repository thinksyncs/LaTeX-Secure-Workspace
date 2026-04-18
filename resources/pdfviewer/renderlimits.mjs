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
    maxRenderedPages: 1,
    minOutputScale: 0.1,
    minPlaceholderCanvasSize: 1,
    pageCleanupBatchSize: 4,
    renderMarginMultiplier: 0,
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

export function pickPageNumbersToRender(pageMetrics, viewportTop, viewportHeight, pendingPageNumber, limits = PDF_VIEWER_LIMITS) {
    const safeTop = Number(viewportTop) || 0
    const safeHeight = Math.max(1, Number(viewportHeight) || 1)
    const viewportBottom = safeTop + safeHeight
    const viewportCenter = safeTop + safeHeight / 2
    const margin = safeHeight * limits.renderMarginMultiplier
    const visiblePages = []
    let nearestPageNumber
    let nearestDistance = Number.POSITIVE_INFINITY

    for (const pageMetric of pageMetrics) {
        const pageTop = Number(pageMetric.pageTop) || 0
        const pageBottom = Math.max(pageTop, Number(pageMetric.pageBottom) || pageTop)
        const pageCenter = (pageTop + pageBottom) / 2
        const distance = Math.abs(pageCenter - viewportCenter)

        if (pageBottom >= safeTop - margin && pageTop <= viewportBottom + margin) {
            visiblePages.push({
                distance,
                pageNumber: pageMetric.pageNumber,
            })
        }

        if (distance < nearestDistance) {
            nearestDistance = distance
            nearestPageNumber = pageMetric.pageNumber
        }
    }

    visiblePages.sort((left, right) => left.distance - right.distance)
    const pageNumbers = new Set(
        visiblePages.slice(0, limits.maxRenderedPages).map(page => page.pageNumber)
    )

    if (pendingPageNumber !== undefined) {
        pageNumbers.add(pendingPageNumber)
    }
    if (pageNumbers.size === 0 && nearestPageNumber !== undefined) {
        pageNumbers.add(nearestPageNumber)
    }

    while (pageNumbers.size > limits.maxRenderedPages) {
        let farthestPageNumber
        let farthestDistance = Number.NEGATIVE_INFINITY

        for (const pageNumber of pageNumbers) {
            if (pageNumber === pendingPageNumber) {
                continue
            }

            const pageMetric = pageMetrics.find(metric => metric.pageNumber === pageNumber)
            if (!pageMetric) {
                continue
            }

            const pageTop = Number(pageMetric.pageTop) || 0
            const pageBottom = Math.max(pageTop, Number(pageMetric.pageBottom) || pageTop)
            const distance = Math.abs((pageTop + pageBottom) / 2 - viewportCenter)
            if (distance > farthestDistance) {
                farthestDistance = distance
                farthestPageNumber = pageNumber
            }
        }

        if (farthestPageNumber === undefined) {
            break
        }
        pageNumbers.delete(farthestPageNumber)
    }

    return [...pageNumbers]
}
