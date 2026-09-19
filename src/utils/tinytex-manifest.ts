// Pinned TinyTeX-1 assets from the publisher's v2026.09 release.
// Source: https://github.com/rstudio/tinytex-releases/releases/tag/v2026.09
// Updating this manifest requires checking the official asset digests and
// rerunning the clean-install smoke tests. Never resolve "latest" at runtime.
export type TinyTexAsset = {
    name: string,
    sha256: string,
    bytes: number,
    root: 'TinyTeX' | '.TinyTeX',
    bin: string
}

export const TINYTEX_VERSION = 'v2026.09'
export const TINYTEX_RELEASE = `https://github.com/rstudio/tinytex-releases/releases/tag/${TINYTEX_VERSION}`

const assets: Record<string, TinyTexAsset> = {
    darwin: {
        name: 'TinyTeX-1-darwin-v2026.09.tar.xz',
        sha256: '974bb21f394def11780788eaacf77ae8fc1974a60bc9e75a9a2f9d735db479fe',
        bytes: 67054512, root: 'TinyTeX', bin: 'universal-darwin'
    },
    win32: {
        name: 'TinyTeX-1-windows-v2026.09.exe',
        sha256: 'eea6a6e5f97d44416ca9ea974385af1ffd3fa119be19d34cdaf2abc85775d374',
        bytes: 73670885, root: 'TinyTeX', bin: 'windows'
    },
    'linux-x64': {
        name: 'TinyTeX-1-linux-x86_64-v2026.09.tar.xz',
        sha256: 'cf9a4d19742eeb6d54a3de91fb5df071360f23877cafa5b39893421b32ca6295',
        bytes: 53554120, root: '.TinyTeX', bin: 'x86_64-linux'
    },
    'linux-arm64': {
        name: 'TinyTeX-1-linux-arm64-v2026.09.tar.xz',
        sha256: 'ef8eb34928ed5ea4a39dfd1b797c6cdac7db7c0b3d289727bea03f716d222086',
        bytes: 53327772, root: '.TinyTeX', bin: 'aarch64-linux'
    },
    'linux-musl': {
        name: 'TinyTeX-1-linuxmusl-x86_64-v2026.09.tar.xz',
        sha256: '14a05b1cf338c5f53a467131f14bc2a5ac55ac144eff1cd49e99bda30f29e38d',
        bytes: 54639988, root: '.TinyTeX', bin: 'x86_64-linuxmusl'
    }
}

export function getTinyTexAsset(platform: NodeJS.Platform, arch: string, musl = false): TinyTexAsset | undefined {
    if (!['x64', 'arm64'].includes(arch)) {
        return undefined
    }
    if (platform === 'darwin') {
        return assets.darwin
    }
    if (platform === 'win32') {
        return arch === 'x64' ? assets.win32 : undefined
    }
    if (platform === 'linux') {
        return musl ? (arch === 'x64' ? assets['linux-musl'] : undefined) : assets[`linux-${arch}`]
    }
    return undefined
}

export function tinyTexDownloadUrl(asset: TinyTexAsset): string {
    return `https://github.com/rstudio/tinytex-releases/releases/download/${TINYTEX_VERSION}/${asset.name}`
}
