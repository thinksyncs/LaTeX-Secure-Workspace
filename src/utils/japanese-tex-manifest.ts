// Pinned TeX Live runtime packages from a CTAN mirror, checked 2026-09-19.
// These are data/font packages, not installers. If upstream replaces an archive,
// fail its checksum rather than silently accepting new bytes.
// Keep the upstream license/documentation archives with the runtime packages.
export const JAPANESE_TEX_SOURCE = 'https://ctan.net/systems/texlive/tlnet/archive/'
export const JAPANESE_TEX_PACKAGES = [
    { name: 'cjk.tar.xz', bytes: 58480, sha256: '744904abda9141fa1a448b6ad3ab6d1389e515e98dbad9489613d98194eee0f2' },
    { name: 'ipaex-type1.tar.xz', bytes: 13160912, sha256: '52a333d30904a1badd9edd31241cf391c426b67b5387c8c7c9bc76b5f9d90a68' },
    { name: 'cjk.doc.tar.xz', bytes: 1477448, sha256: '803b33ed94d274ce300468ce357f882a0bc7c82bc56c82a1b1eaed479004e843' },
    { name: 'ipaex-type1.doc.tar.xz', bytes: 369204, sha256: '31405b12b24579f14774ff1550b467f7afe242969dd4b1040ae56fa9c459c95c' }
] as const

export type ManagedTexProfile = 'lightweight' | 'japanese'

export function managedTexDirectory(profile: ManagedTexProfile): string {
    if (profile !== 'lightweight' && profile !== 'japanese') {
        throw new Error('Unknown managed TeX profile.')
    }
    return profile === 'japanese' ? 'tinytex-japanese' : 'tinytex'
}
