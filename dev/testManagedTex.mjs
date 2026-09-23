import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import managed from '../out/src/utils/managed-tex.js'
import windowsBuild from '../out/src/utils/windows-build.js'
import { checkWindowsBuild } from './testWindowsBuild.mjs'

const run = promisify(execFile)
const profile = process.argv[2] ?? 'lightweight'
assert.ok(['lightweight', 'japanese'].includes(profile))
// Windows os.tmpdir() may use an 8.3 alias (RUNNER~1), which latexmk rejects.
// Use the real long path, as VS Code's globalStorageUri does.
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'lw-managed-tex-')))
const storage = process.env.LW_TEST_PRIVATE_STORAGE ?? path.join(root, 'profile storage')
const japaneseUser = process.env.LW_TEST_JAPANESE_USER === '1'
if (japaneseUser) {
    assert.equal(process.platform, 'win32')
    assert.match(os.userInfo().username, /[^\x20-\x7e]/)
    assert.match(process.env.USERPROFILE, /[^\x20-\x7e]/)
    assert.match(root, /[^\x20-\x7e]/)
    assert.ok(managed.isWindowsAsciiStorage(storage))
    await managed.validatePrivateTexStorage(storage, path.resolve('resources/check-private-tex-storage.ps1'))
}
// Test with no existing TeX or third-party Perl on PATH. This changes only this
// disposable test process, never the normal VS Code profile or OS environment.
const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
for (const key of Object.keys(process.env)) {
    if (key.toLowerCase() === 'path') delete process.env[key]
}
process.env.PATH = process.platform === 'win32'
    ? [path.join(systemRoot, 'System32'), systemRoot].join(';') : '/usr/bin:/bin'
const initialPath = process.env.PATH
if (process.platform === 'win32') {
    const unsupported = path.join(root, '日本語-profile')
    await assert.rejects(managed.installManagedTex(unsupported, { profile,
        signal: AbortSignal.timeout(1000), progress() { throw new Error('Unsupported storage must not download') }
    }), /ASCII/)
    assert.equal(await fs.stat(unsupported).then(() => true, () => false), false)
}
let lastMessage = ''
const installOptions = {
    profile,
    signal: AbortSignal.timeout(12 * 60 * 1000),
    progress(message) {
        if (!message.startsWith('Downloading') || /(?:0|25|50|75|100)%$/.test(message)) {
            if (message !== lastMessage) console.log(message)
            lastMessage = message
        }
    }
}
const offlineDirectory = await managed.prepareManagedTexBundle(root, installOptions)
const originalFetch = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
assert.ok(originalFetch)
let offlineFetchAttempts = 0
Object.defineProperty(globalThis, 'fetch', { ...originalFetch,
    value: async () => { offlineFetchAttempts++; throw new Error('Offline import must not download') }
})
let bin
try {
    bin = await managed.installManagedTex(storage, {...installOptions, offlineDirectory})
} finally {
    Object.defineProperty(globalThis, 'fetch', originalFetch)
}
assert.equal(offlineFetchAttempts, 0)
assert.equal(managed.getManagedTexBin(storage, profile), bin)
assert.equal(await managed.installManagedTex(storage, {
    profile, signal: AbortSignal.timeout(1000), progress() { throw new Error('Existing installation must be reused without downloading') }
}), bin)
assert.equal(process.env.PATH, initialPath, 'Installation must not change the process or OS PATH')
// The pinned Windows Perl/latexmk runner can reject a Unicode project path
// under a Western system code page. Keep that probe visible, not silently fixed
// by a short-path alias; validate the supported ASCII project separately.
const projectRoot = japaneseUser ? path.dirname(storage) : root
const project = path.join(projectRoot, 'project with spaces')
const output = path.join(project, '.lw-security')
await fs.mkdir(output, { recursive: true })
await fs.copyFile(profile === 'japanese' ? 'resources/sample-japanese.tex' : 'resources/sample-english.tex', path.join(project, 't.tex'))
const recipe = JSON.parse(await fs.readFile('src/compile/fixedSecureRecipeArguments.json', 'utf8'))
const args = [...recipe.commonArgsBeforeEngine, ...recipe.engineArgs.pdflatex,
    ...recipe.commonArgsAfterEngine.map(arg => arg.replace('%DOCFILE%', output).replace('%DOC%', path.join(project, 't.tex')))]
const env = managed.texEnvironment(bin)
const executable = path.join(bin, process.platform === 'win32' ? 'latexmk.exe' : 'latexmk')
const invocation = process.platform === 'win32'
    ? windowsBuild.prepareWindowsBuild(executable, args, env, [project], path.resolve('resources/secure-latexmkrc'))
    : { command: executable, args, env }
let unicodeProjectProbe
if (japaneseUser) {
    const unicodeProject = path.join(root, 'project with spaces')
    const unicodeOutput = path.join(unicodeProject, '.lw-security')
    await fs.mkdir(unicodeOutput, { recursive: true })
    await fs.copyFile('resources/sample-japanese.tex', path.join(unicodeProject, 't.tex'))
    const unicodeArgs = args.map(arg => arg.replaceAll(project, unicodeProject))
    const unicodeInvocation = windowsBuild.prepareWindowsBuild(executable, unicodeArgs, env, [unicodeProject], path.resolve('resources/secure-latexmkrc'))
    try {
        await run(unicodeInvocation.command, unicodeInvocation.args, { cwd: unicodeProject, env: unicodeInvocation.env,
            windowsVerbatimArguments: unicodeInvocation.windowsVerbatimArguments, timeout: 120000, maxBuffer: 4 * 1024 * 1024 })
        assert.equal((await fs.readFile(path.join(unicodeOutput, 't.pdf'))).subarray(0, 5).toString(), '%PDF-')
        unicodeProjectProbe = { supported: true }
    } catch (error) {
        assert.match(String(error.stderr), /contains character not allowed for TeX file/)
        unicodeProjectProbe = { supported: false, reason: 'Pinned Windows latexmk rejects the Unicode project path on this runner; use an ASCII project folder.' }
    }
}
const result = await run(invocation.command, invocation.args, { cwd: project, env: invocation.env,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments, timeout: 120000, maxBuffer: 4 * 1024 * 1024 })
assert.ok(result.stdout.includes('Latexmk'))
const pdf = await fs.readFile(path.join(output, 't.pdf'))
assert.equal(pdf.subarray(0, 5).toString(), '%PDF-')
const { getDocument, OPS } = await import('pdfjs-dist/legacy/build/pdf.mjs')
const document = await getDocument({ data: new Uint8Array(pdf), useSystemFonts: false, fontExtraProperties: true }).promise
const page = await document.getPage(1)
const text = (await page.getTextContent()).items.map(item => item.str ?? '').join('')
const operators = await page.getOperatorList()
const fontIds = new Set(operators.argsArray.filter((_args, i) => operators.fnArray[i] === OPS.setFont).map(args => args[0]))
const fonts = [...fontIds].map(id => {
    const font = page.commonObjs.get(id)
    return { name: font.name, embedded: Boolean(font.data?.length) }
})
if (profile === 'japanese') {
    assert.ok(text.includes('日本語の文書'), `Japanese text was not extracted: ${text}`)
    assert.ok(text.includes('ゴシック体'), `Gothic text was not extracted: ${text}`)
    // IPAex Type1's PostScript names are IMFCTT1 (Mincho) / IGFCTT1 (Gothic),
    // as specified in the pinned ipaex-type1.map, not the desktop font names.
    for (const family of ['IMFCTT1-', 'IGFCTT1-']) {
        assert.ok(fonts.some(font => font.name.includes(family) && font.embedded), `Missing embedded ${family}: ${JSON.stringify(fonts)}`)
    }
} else {
    assert.ok(text.includes('abcd'))
}
await document.destroy()
const executableBoundary = process.platform === 'win32' ? await checkWindowsBuild(bin, projectRoot) : undefined
const evidence = { status: 'passed', root, profile, platform: process.platform, arch: process.arch,
    bin, pdfSha256: createHash('sha256').update(pdf).digest('hex'),
    text, fonts, executableBoundary,
    installReusedWithoutDownload: true, processPathUnchanged: true,
    offlineImportVerified: true, offlineFetchAttempts, japaneseUser, project, unicodeProjectProbe,
    ...(japaneseUser ? { username: os.userInfo().username, userProfile: process.env.USERPROFILE, privateStorageValidated: true } : {}),
    scope: 'Disposable extension-style storage; no normal VS Code profile or system TeX installation changed.' }
await fs.writeFile(path.join(root, 'qa-report.json'), JSON.stringify(evidence, null, 2) + '\n')
if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, `evidence=${root}\n`)
}
console.log(JSON.stringify(evidence, null, 2))
