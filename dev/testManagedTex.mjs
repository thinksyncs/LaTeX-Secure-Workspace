import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import managed from '../out/src/utils/managed-tex.js'

const run = promisify(execFile)
const profile = process.argv[2] ?? 'lightweight'
assert.ok(['lightweight', 'japanese'].includes(profile))
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lw-managed-tex-'))
const storage = path.join(root, 'profile storage')
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
const bin = await managed.installManagedTex(storage, {
    profile,
    signal: AbortSignal.timeout(12 * 60 * 1000),
    progress(message) {
        if (!message.startsWith('Downloading') || /(?:0|25|50|75|100)%$/.test(message)) {
            if (message !== lastMessage) console.log(message)
            lastMessage = message
        }
    }
})
assert.equal(managed.getManagedTexBin(storage, profile), bin)
assert.equal(await managed.installManagedTex(storage, {
    profile, signal: AbortSignal.timeout(1000), progress() { throw new Error('Existing installation must be reused without downloading') }
}), bin)
assert.equal(process.env.PATH, initialPath, 'Installation must not change the process or OS PATH')
const project = path.join(root, 'project with spaces')
const output = path.join(project, '.lw-security')
await fs.mkdir(output, { recursive: true })
await fs.copyFile(profile === 'japanese' ? 'resources/sample-japanese.tex' : 'samples/sample/t.tex', path.join(project, 't.tex'))
const recipe = JSON.parse(await fs.readFile('src/compile/fixedSecureRecipeArguments.json', 'utf8'))
const args = [...recipe.commonArgsBeforeEngine, ...recipe.engineArgs.pdflatex,
    ...recipe.commonArgsAfterEngine.map(arg => arg.replace('%DOCFILE%', output).replace('%DOC%', path.join(project, 't.tex')))]
const env = managed.texEnvironment(bin)
const executable = path.join(bin, process.platform === 'win32' ? 'latexmk.exe' : 'latexmk')
const result = await run(executable, args, { cwd: project, env, timeout: 120000, maxBuffer: 4 * 1024 * 1024 })
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
const evidence = { status: 'passed', root, profile, platform: process.platform, arch: process.arch,
    bin, pdfSha256: createHash('sha256').update(pdf).digest('hex'),
    text, fonts,
    installReusedWithoutDownload: true, processPathUnchanged: true,
    scope: 'Disposable extension-style storage; no normal VS Code profile or system TeX installation changed.' }
await fs.writeFile(path.join(root, 'qa-report.json'), JSON.stringify(evidence, null, 2) + '\n')
if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(process.env.GITHUB_OUTPUT, `evidence=${root}\n`)
}
console.log(JSON.stringify(evidence, null, 2))
