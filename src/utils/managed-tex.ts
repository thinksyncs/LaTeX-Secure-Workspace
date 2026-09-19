import * as fs from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { getTinyTexAsset, tinyTexDownloadUrl, TINYTEX_VERSION, type TinyTexAsset } from './tinytex-manifest'
import { JAPANESE_TEX_PACKAGES, JAPANESE_TEX_SOURCE, managedTexDirectory, type ManagedTexProfile } from './japanese-tex-manifest'

const run = promisify(execFile)
const markerName = '.latex-workspace-install.json'
let storagePath: string | undefined

export function configureManagedTexStorage(root: string | undefined): void {
    // Merely remember extension-owned storage. Activation performs no IO,
    // network requests, installation or executable probes.
    storagePath = root
}

export function getManagedTexStorage(): string | undefined {
    return storagePath
}

export function isMuslLinux(): boolean {
    return process.platform === 'linux' && fs.existsSync('/etc/alpine-release')
}

export function getCurrentTinyTexAsset(): TinyTexAsset | undefined {
    return getTinyTexAsset(process.platform, process.arch, isMuslLinux())
}

export function getManagedTexBin(root = storagePath, profile: ManagedTexProfile = 'lightweight'): string | undefined {
    const asset = getCurrentTinyTexAsset()
    if (!root || !asset) {
        return undefined
    }
    try {
        const install = path.join(root, managedTexDirectory(profile))
        if (fs.lstatSync(install).isSymbolicLink()) {
            return undefined
        }
        const marker = JSON.parse(fs.readFileSync(path.join(install, markerName), 'utf8')) as {
            platform?: string, arch?: string, version?: string, sha256?: string, profile?: string
        }
        if (marker.platform !== process.platform || marker.arch !== process.arch
            || !/^v\d{4}\.\d{2}(?:\.\d+)?$/.test(marker.version ?? '') || !/^[a-f0-9]{64}$/.test(marker.sha256 ?? '')) {
            return undefined
        }
        if ((marker.profile ?? 'lightweight') !== profile) {
            return undefined
        }
        const bin = path.join(install, 'bin', asset.bin)
        for (const tool of ['latexmk', 'pdflatex']) {
            const resolved = fs.realpathSync(path.join(bin, tool + (process.platform === 'win32' ? '.exe' : '')))
            if (!isInside(fs.realpathSync(install), resolved)) {
                return undefined
            }
        }
        return bin
    } catch {
        return undefined
    }
}

export function texEnvironment(bin: string, env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): NodeJS.ProcessEnv {
    const pathKeys = Object.keys(env).filter(key => platform === 'win32' ? key.toLowerCase() === 'path' : key === 'PATH').sort()
    const pathKey = pathKeys[0] ?? 'PATH'
    const result = { ...env }
    for (const duplicate of pathKeys.slice(1)) {
        delete result[duplicate]
    }
    result[pathKey] = [bin, env[pathKey]].filter(Boolean).join(platform === 'win32' ? ';' : ':')
    return result
}

export function getManagedTexEnvironment(profile: ManagedTexProfile = 'lightweight'): NodeJS.ProcessEnv | undefined {
    const bin = getManagedTexBin(storagePath, profile)
    return bin ? texEnvironment(bin) : undefined
}

export function getManagedTexPathOverride(profile: ManagedTexProfile = 'lightweight'): NodeJS.ProcessEnv {
    const bin = getManagedTexBin(storagePath, profile)
    if (!bin) {
        return {}
    }
    const env = texEnvironment(bin)
    const key = Object.keys(env).find(name => process.platform === 'win32' ? name.toLowerCase() === 'path' : name === 'PATH') ?? 'PATH'
    return { [key]: env[key] }
}

function isInside(root: string, candidate: string): boolean {
    const relative = path.relative(root, candidate)
    return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

export function validateArchiveListing(listing: string, root: string): void {
    const entries = listing.trim().split(/\r?\n/)
    if (!listing.trim() || entries.length > 50000) {
        throw new Error('Invalid TinyTeX archive listing.')
    }
    for (const entry of entries) {
        const normalized = entry.replace(/^\.\//, '')
        if (normalized !== root && !normalized.startsWith(root + '/') || normalized.includes('\\')
            || normalized.split('/').includes('..') || [...normalized].some(char => char.charCodeAt(0) < 32)) {
            throw new Error('TinyTeX archive contains an unexpected path.')
        }
    }
}

export function isAllowedDownloadUrl(value: string): boolean {
    try {
        const url = new URL(value)
        return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
            && ['github.com', 'release-assets.githubusercontent.com', 'ctan.net'].includes(url.hostname)
    } catch {
        return false
    }
}

export async function downloadTinyTex(
    asset: TinyTexAsset, destination: string, signal: AbortSignal,
    progress: (message: string) => void, fetcher: typeof fetch = fetch
): Promise<void> {
    return downloadPinnedAsset(asset, tinyTexDownloadUrl(asset), destination, signal, progress, fetcher)
}

async function downloadPinnedAsset(
    asset: { bytes: number, sha256: string }, url: string, destination: string, signal: AbortSignal,
    progress: (message: string) => void, fetcher: typeof fetch = fetch
): Promise<void> {
    let response: Response | undefined
    for (let redirects = 0; redirects <= 5; redirects++) {
        if (!isAllowedDownloadUrl(url)) {
            throw new Error('TinyTeX download redirected outside the approved HTTPS hosts.')
        }
        response = await fetcher(url, { redirect: 'manual', signal })
        if ([301, 302, 303, 307, 308].includes(response.status)) {
            const location = response.headers.get('location')
            await response.body?.cancel()
            if (!location) {
                throw new Error('TinyTeX download redirect has no location.')
            }
            url = new URL(location, url).href
            continue
        }
        break
    }
    if (!response?.ok || !response.body) {
        throw new Error(`TinyTeX download failed (HTTP ${response?.status ?? 'unavailable'}).`)
    }
    const digest = createHash('sha256')
    const handle = await fs.promises.open(destination, 'wx', 0o600)
    let bytes = 0
    let lastPercent = -1
    try {
        for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
            signal.throwIfAborted()
            bytes += chunk.byteLength
            if (bytes > asset.bytes) {
                throw new Error('TinyTeX download exceeds the expected size.')
            }
            digest.update(chunk)
            await handle.writeFile(chunk)
            const percent = Math.floor(bytes * 100 / asset.bytes)
            if (percent !== lastPercent) {
                progress(`Downloading TinyTeX: ${percent}%`)
                lastPercent = percent
            }
        }
    } finally {
        await handle.close()
    }
    if (bytes !== asset.bytes || digest.digest('hex') !== asset.sha256) {
        throw new Error('TinyTeX download failed its size or SHA-256 check. Nothing was installed.')
    }
}

async function validateExtractedTree(root: string, directory = root): Promise<void> {
    for (const entry of await fs.promises.readdir(directory, { withFileTypes: true })) {
        const candidate = path.join(directory, entry.name)
        if (entry.isSymbolicLink()) {
            if (!isInside(root, await fs.promises.realpath(candidate))) {
                throw new Error('TinyTeX archive contains a link outside its installation.')
            }
        } else if (entry.isDirectory()) {
            await validateExtractedTree(root, candidate)
        } else if (!entry.isFile()) {
            throw new Error('TinyTeX archive contains an unsupported filesystem entry.')
        }
    }
}

export async function installManagedTex(
    root: string,
    options: { signal: AbortSignal, progress: (message: string) => void, profile?: ManagedTexProfile }
): Promise<string> {
    const profile = options.profile ?? 'lightweight'
    const directory = managedTexDirectory(profile)
    const asset = getCurrentTinyTexAsset()
    if (!asset) {
        throw new Error('Automatic TeX installation is not available for this OS/architecture. Use the installation guide.')
    }
    if (!path.isAbsolute(root) || (process.platform === 'win32' && /[^\x20-\x7e]/.test(root))) {
        throw new Error('This TinyTeX installation needs an absolute path; on Windows the path must contain only ASCII characters. Use an existing TeX installation instead.')
    }
    options.signal.throwIfAborted()
    await fs.promises.mkdir(root, { recursive: true, mode: 0o700 })
    if ((await fs.promises.lstat(root)).isSymbolicLink()) {
        throw new Error('Refusing to install through a symbolic-link storage directory.')
    }
    const existing = getManagedTexBin(root, profile)
    if (existing) {
        return existing
    }
    const destination = path.join(root, directory)
    if (fs.existsSync(destination)) {
        throw new Error('A previous TinyTeX directory exists but is incomplete. It was not overwritten. See the installation guide.')
    }
    const lock = path.join(root, 'tinytex-install.lock')
    try {
        await fs.promises.mkdir(lock)
    } catch {
        throw new Error('Another TeX installation may be running. If it was interrupted, see the installation guide before retrying.')
    }
    let staging: string | undefined
    const execOptions = { signal: options.signal, timeout: 120000, maxBuffer: 16 * 1024 * 1024, windowsHide: true }
    try {
        staging = await fs.promises.mkdtemp(path.join(root, '.tinytex-stage-'))
        if (process.platform !== 'win32') {
            options.progress('Checking system Perl (required by latexmk)')
            await run('/usr/bin/perl', ['-MFile::Find', '-e', '1'], { ...execOptions, cwd: staging })
        }
        const archive = path.join(staging, asset.name)
        await downloadTinyTex(asset, archive, options.signal, options.progress)
        options.signal.throwIfAborted()
        options.progress('SHA-256 verified; extracting TinyTeX')
        if (process.platform === 'win32') {
            // The official Windows bundle is a self-extracting archive. Execute
            // only the pinned, verified bytes in our private staging directory.
            await run(archive, ['-y'], { ...execOptions, cwd: staging })
        } else {
            const { stdout } = await run('/usr/bin/tar', ['-tf', archive], { ...execOptions, cwd: staging })
            validateArchiveListing(stdout, asset.root)
            await run('/usr/bin/tar', ['-xf', archive, '--no-same-owner', '-C', staging], { ...execOptions, cwd: staging })
        }
        const extracted = path.join(staging, asset.root)
        if (!(await fs.promises.lstat(extracted)).isDirectory()) {
            throw new Error('TinyTeX archive does not contain the expected directory.')
        }
        await validateExtractedTree(await fs.promises.realpath(extracted))
        const bin = path.join(extracted, 'bin', asset.bin)
        if (profile === 'japanese') {
            // Extend only our new staging copy. The existing profile is untouched.
            const local = path.join(extracted, 'texmf-local')
            await fs.promises.mkdir(local, { recursive: true })
            const tar = process.platform === 'win32'
                ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : '/usr/bin/tar'
            for (const pack of JAPANESE_TEX_PACKAGES) {
                options.progress(`Downloading Japanese support: ${pack.name}`)
                const file = path.join(staging, pack.name)
                await downloadPinnedAsset(pack, JAPANESE_TEX_SOURCE + pack.name, file, options.signal, () => {})
                const { stdout } = await run(tar, ['-tf', file], { ...execOptions, cwd: staging })
                validateJapaneseArchiveListing(stdout)
                await run(tar, ['-xf', file, '--no-same-owner', '-C', local], { ...execOptions, cwd: staging })
            }
            await validateExtractedTree(await fs.promises.realpath(local))
            options.progress('Registering IPAex Mincho and Gothic inside the managed TeX copy')
            for (const [tool, args] of [['mktexlsr', []], ['updmap-sys', ['--enable', 'Map=ipaex-type1.map']]] as const) {
                await run(path.join(bin, tool + (process.platform === 'win32' ? '.exe' : '')), [...args], {
                    ...execOptions, cwd: extracted, env: texEnvironment(bin)
                })
            }
        }
        options.progress('Checking installed latexmk and pdfLaTeX')
        for (const [tool, arg] of [['latexmk', '-version'], ['pdflatex', '--version']]) {
            await run(path.join(bin, tool + (process.platform === 'win32' ? '.exe' : '')), [arg], {
                ...execOptions, cwd: extracted, env: texEnvironment(bin)
            })
        }
        options.signal.throwIfAborted()
        await fs.promises.writeFile(path.join(extracted, markerName), JSON.stringify({
            version: TINYTEX_VERSION, sha256: asset.sha256, platform: process.platform, arch: process.arch, profile,
            ...(profile === 'japanese' ? { packages: JAPANESE_TEX_PACKAGES } : {})
        }) + '\n', { flag: 'wx', mode: 0o600 })
        // The lock prevents two extension windows from committing an install.
        // Never delete or overwrite an existing toolchain, including incomplete ones.
        if (fs.existsSync(destination)) {
            throw new Error('TinyTeX destination appeared during installation; it was not overwritten.')
        }
        await fs.promises.rename(extracted, destination)
        return path.join(destination, 'bin', asset.bin)
    } finally {
        // Only this invocation's private, randomly named staging directory and
        // empty lock are removed. Existing installations are never removed.
        if (staging) {
            await fs.promises.rm(staging, { recursive: true, force: true })
        }
        await fs.promises.rmdir(lock)
    }
}

export function validateJapaneseArchiveListing(listing: string): void {
    // A font package must not overwrite binaries, configuration or the TeX database.
    const roots = ['tex/', 'fonts/', 'doc/', 'tlpkg/tlpobj/']
    if (!listing.trim() || listing.trim().split(/\r?\n/).length > 50000) {
        throw new Error('Invalid Japanese package listing.')
    }
    for (const entry of listing.trim().split(/\r?\n/)) {
        if (entry === 'tlpkg/') {
            continue
        }
        if (!roots.some(root => entry.startsWith(root)) || entry.includes('\\')
            || entry.split('/').includes('..') || [...entry].some(char => char.charCodeAt(0) < 32)) {
            throw new Error('Japanese package contains an unexpected path.')
        }
    }
}
