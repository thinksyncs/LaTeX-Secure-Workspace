import * as path from 'path'

export type GraphicsInclude = {
    readonly imagePath: string,
    readonly index: number,
    readonly length: number
}

export type ImageResolution = {
    readonly candidates: string[],
    readonly unsupportedExtension?: string
}

export const supportedImageExtensions = ['.pdf', '.png', '.jpg', '.jpeg'] as const
export const knownButUnsupportedExtensions = ['.eps', '.svg', '.gif', '.tif', '.tiff', '.webp'] as const

export function collectIncludeGraphics(content: string): GraphicsInclude[] {
    const result: GraphicsInclude[] = []
    const pattern = /\\includegraphics\s*(?:\[[^\]]*\]\s*)?(?:\[[^\]]*\]\s*)?\{([^}]+)\}/g
    let match: RegExpExecArray | null

    while ((match = pattern.exec(content)) !== null) {
        const imagePath = match[1]?.trim()
        if (!imagePath || shouldSkipImagePath(imagePath) || isCommentedOut(content, match.index)) {
            continue
        }
        result.push({
            imagePath,
            index: match.index + match[0].indexOf(imagePath),
            length: imagePath.length
        })
    }
    return result
}

export function collectGraphicspathDirs(content: string): string[] {
    const result: string[] = []
    const pattern = /\\graphicspath\s*\{\s*((?:\{[^{}]*\}\s*)+)\}/g
    let match: RegExpExecArray | null

    while ((match = pattern.exec(content)) !== null) {
        const body = match[1] ?? ''
        for (const dirMatch of body.matchAll(/\{([^{}]*)\}/g)) {
            const dir = dirMatch[1]?.trim()
            if (dir && !shouldSkipImagePath(dir)) {
                result.push(dir)
            }
        }
    }
    return [...new Set(result)]
}

export function buildImageResolution(imagePath: string, documentDir: string, rootDir?: string, graphicsPathDirs: string[] = []): ImageResolution {
    const baseDirs = collectSearchDirs(documentDir, rootDir, graphicsPathDirs)
    const parsedExt = path.extname(imagePath).toLowerCase()
    const candidates = parsedExt
        ? baseDirs.map(dir => path.resolve(dir, imagePath))
        : baseDirs.flatMap(dir => supportedImageExtensions.map(ext => path.resolve(dir, `${imagePath}${ext}`)))
    const unsupportedExtension = parsedExt && isUnsupportedImageExtension(parsedExt) ? parsedExt : undefined
    return { candidates, unsupportedExtension }
}

export function buildUnsupportedExtensionCandidates(imagePath: string, documentDir: string, rootDir?: string, graphicsPathDirs: string[] = []): string[] {
    if (path.extname(imagePath)) {
        return []
    }
    return collectSearchDirs(documentDir, rootDir, graphicsPathDirs)
        .flatMap(dir => knownButUnsupportedExtensions.map(ext => path.resolve(dir, `${imagePath}${ext}`)))
}

export function isUnsupportedImageExtension(extOrFilePath: string): boolean {
    const ext = extOrFilePath.startsWith('.') ? extOrFilePath.toLowerCase() : path.extname(extOrFilePath).toLowerCase()
    return knownButUnsupportedExtensions.includes(ext as typeof knownButUnsupportedExtensions[number])
}

function collectSearchDirs(documentDir: string, rootDir: string | undefined, graphicsPathDirs: string[]): string[] {
    const roots = [documentDir, rootDir].filter((dir): dir is string => Boolean(dir))
    const dirs = roots.flatMap(baseDir => [
        baseDir,
        ...graphicsPathDirs.map(graphicsDir => path.resolve(baseDir, graphicsDir))
    ])
    return [...new Set(dirs)]
}

function shouldSkipImagePath(imagePath: string): boolean {
    return imagePath.includes('\\') || imagePath.includes('{') || imagePath.includes('}')
}

function isCommentedOut(text: string, offset: number): boolean {
    const lineStart = text.lastIndexOf('\n', offset) + 1
    const prefix = text.slice(lineStart, offset)
    return /^\s*%/.test(prefix)
}
