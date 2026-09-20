// Exercise the production Windows launcher with real TeX tools and benign
// project-local executable decoys. Other platforms test the Perl policy only.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import windowsBuild from '../out/src/utils/windows-build.js'
import managed from '../out/src/utils/managed-tex.js'

const run = promisify(execFile)
const repo = fileURLToPath(new URL('../', import.meta.url))

export async function checkWindowsBuild(bin, storage) {
    const project = path.join(storage, 'boundary project with spaces')
    const output = path.join(project, '.lw-security')
    await fs.mkdir(output, { recursive: true })
    const source = String.raw`\documentclass{article}
\usepackage{makeidx}
\makeindex
\begin{document}
Safe build\index{safe} with a reference~\cite{example}.
\bibliographystyle{plain}
\bibliography{references}
\printindex
\end{document}
`
    await fs.writeFile(path.join(project, 't.tex'), source)
    await fs.writeFile(path.join(project, 'references.bib'), '@book{example,author={A. Author},title={A Reference},year={2026},publisher={Example}}\n')
    const env = managed.texEnvironment(bin)
    const marker = path.join(storage, 'untrusted-tool-ran.txt')
    if (process.platform === 'win32') {
        const canary = path.join(storage, 'canary.cjs')
        await fs.writeFile(canary, `require('fs').writeFileSync(${JSON.stringify(marker)}, process.execPath); process.exit(97);\n`)
        env.NODE_OPTIONS = `--require "${canary}"`
        const decoy = path.join(storage, 'decoy.exe')
        await fs.copyFile(process.execPath, decoy)
        for (const directory of [project, output]) {
            for (const name of ['latexmk', 'pdflatex', 'bibtex', 'biber', 'makeindex', 'kpsewhich', 'perl', 'cmd']) {
                await fs.link(decoy, path.join(directory, name + '.exe'))
                await fs.writeFile(path.join(directory, name + '.cmd'), '@echo off\r\n> "%LW_UNTRUSTED_MARKER%" echo untrusted\r\nexit /b 97\r\n')
            }
        }
        env.LW_UNTRUSTED_MARKER = marker
    } else {
        for (const name of ['pdflatex', 'bibtex', 'biber', 'makeindex', 'kpsewhich']) {
            env['LW_SECURE_' + name.toUpperCase()] = path.join(bin, name)
        }
    }
    const recipe = JSON.parse(await fs.readFile(path.join(repo, 'src/compile/fixedSecureRecipeArguments.json'), 'utf8'))
    const args = [...recipe.commonArgsBeforeEngine, ...recipe.engineArgs.pdflatex,
        ...recipe.commonArgsAfterEngine.map(arg => arg.replace('%DOCFILE%', output).replace('%DOC%', path.join(project, 't.tex')))]
    const policy = path.join(repo, 'resources/secure-latexmkrc')
    const invocation = process.platform === 'win32'
        ? windowsBuild.prepareWindowsBuild('latexmk', args, env, [project], policy)
        : { command: path.join(bin, 'latexmk'), args: ['-norc', '-r', policy, ...args], env }
    let result
    try {
        result = await run(invocation.command, invocation.args, {
            cwd: project, env: invocation.env, windowsVerbatimArguments: invocation.windowsVerbatimArguments,
            timeout: 120000, maxBuffer: 4 * 1024 * 1024
        })
    } finally {
        assert.equal(await fs.stat(marker).then(() => true, () => false), false, 'A project-controlled executable ran')
    }
    assert.ok(result.stdout.includes('Latexmk'))
    assert.equal((await fs.readFile(path.join(output, 't.pdf'))).subarray(0, 5).toString(), '%PDF-')
    assert.match(await fs.readFile(path.join(output, 't.bbl'), 'utf8'), /A Reference/)
    assert.match(await fs.readFile(path.join(output, 't.ind'), 'utf8'), /safe/)
    return { platform: process.platform, realPdf: true, realBibtex: true, realMakeindex: true,
        projectDecoys: process.platform === 'win32', untrustedToolRan: false }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    assert.ok(process.argv[2], 'Pass the installed TeX bin directory')
    const storage = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'lw-build-policy-')))
    console.log(JSON.stringify({ storage, ...await checkWindowsBuild(path.resolve(process.argv[2]), storage) }, null, 2))
}
