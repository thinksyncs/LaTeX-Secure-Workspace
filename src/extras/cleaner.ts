import * as path from 'path'
import * as fs from 'fs'
import { lw } from '../lw'

const logger = lw.log('Cleaner')
const FIXED_CLEAN_FILE_SUFFIXES = [
    '.aux',
    '.bbl',
    '.blg',
    '.idx',
    '.ind',
    '.lof',
    '.lot',
    '.out',
    '.toc',
    '.acn',
    '.acr',
    '.alg',
    '.glg',
    '.glo',
    '.gls',
    '.fls',
    '.log',
    '.fdb_latexmk',
    '.snm',
    '.synctex(busy)',
    '.synctex.gz(busy)',
    '.nav',
    '.vrb'
]

export {
    clean
}

async function clean(rootFile?: string): Promise<void> {
    if (!rootFile) {
        rootFile = await lw.root.resolveSecurityRoot()
        if (!rootFile) {
            logger.log('Cannot determine the root file to be cleaned.')
            return
        }
    }
    return cleanGlob(rootFile)
}

/** Remove the fixed set of build artifacts for the resolved root document. */
async function cleanGlob(rootFile: string): Promise<void> {
    let secureBuildDir: string | undefined
    try {
        secureBuildDir = lw.file.getValidatedSecurityBuildDir(rootFile)
    } catch (error) {
        logger.logError('Secure cleanup directory rejected.', error)
        logger.refreshStatus('x', 'errorForeground', undefined, 'error')
        void logger.showErrorMessageWithExtensionLogButton('Secure cleanup directory is unsafe. Remove symbolic links from .lw-security and try again.')
        return
    }
    if (!secureBuildDir) {
        logger.log('No secure build directory to clean.')
        return
    }
    const documentName = path.parse(rootFile).name
    const artifactPaths = FIXED_CLEAN_FILE_SUFFIXES.map(suffix => path.join(secureBuildDir, `${documentName}${suffix}`))
    logger.log(`Clean exact build artifacts ${JSON.stringify({artifactPaths, secureBuildDir})} .`)
    let failed = false
    for (const artifactPath of artifactPaths) {
        try {
            const stats = await fs.promises.lstat(artifactPath)
            if (stats.isFile() || stats.isSymbolicLink()) {
                await fs.promises.unlink(artifactPath)
                logger.log(`Cleaning file ${artifactPath} .`)
            } else if (stats.isDirectory()) {
                logger.log(`Not removing folder ${artifactPath} .`)
            } else {
                logger.log(`Not removing non-file ${artifactPath} .`)
            }
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
                continue
            }
            failed = true
            logger.logError(`Failed cleaning path ${artifactPath} .`, err)
            logger.refreshStatus('x', 'errorForeground', `Cleaning failed: ${err}`, 'error')
        }
    }
    if (failed) {
        void logger.showErrorMessageWithExtensionLogButton('Secure cleanup failed for one or more build artifacts. Open the extension log for details.')
    }
}
