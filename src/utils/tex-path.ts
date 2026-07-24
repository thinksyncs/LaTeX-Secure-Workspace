import fs from 'fs'
import path from 'path'

export const MAC_TEX_BIN = '/Library/TeX/texbin'

export function ensureMacTeXBinOnPath(
    platform: NodeJS.Platform = process.platform,
    env: NodeJS.ProcessEnv = process.env,
    exists: (candidate: fs.PathLike) => boolean = fs.existsSync
): boolean {
    if (platform !== 'darwin' || !exists(MAC_TEX_BIN)) {
        return false
    }

    const entries = (env.PATH ?? '').split(path.delimiter).filter(Boolean)
    if (entries.includes(MAC_TEX_BIN)) {
        return false
    }

    env.PATH = [MAC_TEX_BIN, ...entries].join(path.delimiter)
    return true
}
