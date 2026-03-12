interface PdfViewerAppearance {
    codeColorTheme: 'light' | 'dark'
    color: {
        light: {
            backgroundColor: string
            pageBorderColor: string
            pageColorsBackground: string
            pageColorsForeground: string
        }
        dark: {
            backgroundColor: string
            pageBorderColor: string
            pageColorsBackground: string
            pageColorsForeground: string
        }
    }
    invertMode: {
        brightness: number
        enabled: boolean
        grayscale: number
        hueRotate: number
        invert: number
        sepia: number
    }
}

interface ExtendedPreviewWebviewSettings {
    appearance?: PdfViewerAppearance
}

interface PdfViewerApplicationOptions {
    set: (name: string, value: unknown) => void
}

declare global {
    interface Window {
        PDFViewerApplicationOptions: PdfViewerApplicationOptions
    }
}

function loadAppearance(): PdfViewerAppearance | undefined {
    const element = document.getElementById('pdf-preview-config')
    if (!element) {
        return undefined
    }
    const config = JSON.parse(element.getAttribute('data-config') ?? '{}') as ExtendedPreviewWebviewSettings
    return config.appearance
}

function applyAppearanceOptions(): void {
    const appearance = loadAppearance()
    if (!appearance) {
        return
    }
    const color = appearance.codeColorTheme === 'dark' ? appearance.color.dark : appearance.color.light

    document.addEventListener('webviewerloaded', () => {
        window.PDFViewerApplicationOptions.set('backgroundColor', color.backgroundColor)
        window.PDFViewerApplicationOptions.set('forcePageColors', true)
        window.PDFViewerApplicationOptions.set('pageBorderColor', color.pageBorderColor)
        window.PDFViewerApplicationOptions.set('pageColorsBackground', color.pageColorsBackground)
        window.PDFViewerApplicationOptions.set('pageColorsForeground', color.pageColorsForeground)
    }, { once: true })

    window.addEventListener('load', () => {
        const viewerContainer = document.getElementById('viewerContainer')
        const thumbnailsView = document.getElementById('thumbnailsView')
        const viewsManagerContent = document.getElementById('viewsManagerContent')

        if (appearance.invertMode.enabled) {
            const filter = `invert(${appearance.invertMode.invert * 100}%) hue-rotate(${appearance.invertMode.hueRotate}deg) grayscale(${appearance.invertMode.grayscale}) sepia(${appearance.invertMode.sepia}) brightness(${appearance.invertMode.brightness})`
            if (viewerContainer instanceof HTMLElement) {
                viewerContainer.style.filter = filter
            }
            if (thumbnailsView instanceof HTMLElement) {
                thumbnailsView.style.filter = filter
            }
            if (viewsManagerContent instanceof HTMLElement) {
                viewsManagerContent.style.background = 'var(--body-bg-color)'
            }
        }

        if (viewerContainer instanceof HTMLElement) {
            viewerContainer.style.background = color.backgroundColor
        }

        const style = document.createElement('style')
        style.textContent = `.pdfViewer .page { box-shadow: 0px 0px 0px 1px ${color.pageBorderColor}; }`
        document.head.append(style)
    }, { once: true })
}

applyAppearanceOptions()

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./main')
