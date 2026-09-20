'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')
const { spawnSync } = require('node:child_process')
const test = require('node:test')
const ts = require('typescript')
const cs = require('cross-spawn')

const filename = path.resolve(__dirname, '../../src/utils/windows-build.ts')
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 }, fileName: filename
}).outputText
const mod = new Module(filename, module)
mod.filename = filename
mod.paths = Module._nodeModulePaths(path.dirname(filename))
mod._compile(compiled, filename)
const { windowsBuildEnvironment, resolveWindowsBuildTool, windowsToolInvocation, prepareWindowsBuild } = mod.exports

function fixture(t) {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lw-executable-boundary-')))
    t.after(() => fs.rmSync(root, { recursive: true, force: true }))
    const project = path.join(root, '日本語 project')
    const approved = path.join(root, 'approved tools')
    fs.mkdirSync(project)
    fs.mkdirSync(approved)
    return { root, project, approved }
}

test('Windows lookup excludes cwd, relative/empty PATH, project directories and aliases', t => {
    const { root, project, approved } = fixture(t)
    const alias = path.join(root, 'project alias')
    fs.symlinkSync(project, alias, process.platform === 'win32' ? 'junction' : 'dir')
    fs.writeFileSync(path.join(project, 'latexmk.exe'), '')
    fs.writeFileSync(path.join(approved, 'latexmk.exe'), '')
    const original = { PATH: `;.;relative;${project};${alias};"${approved}";`, Path: project, KEEP: 'value' }
    const env = windowsBuildEnvironment(original, [project])
    assert.equal(env.PATH, approved)
    assert.equal(env.Path, undefined)
    assert.equal(env.KEEP, 'value')
    assert.equal(env.NoDefaultCurrentDirectoryInExePath, '1')
    assert.equal(original.Path, project)
    assert.equal(resolveWindowsBuildTool('latexmk', env, [project]), path.join(approved, 'latexmk.exe'))
    assert.throws(() => resolveWindowsBuildTool(path.join(project, 'latexmk.exe'), env, [project]), /Cannot find/)
    assert.throws(() => resolveWindowsBuildTool('./latexmk', env, [project]), /absolute/)
    assert.throws(() => resolveWindowsBuildTool('latexmk', { PATH: '' }, [project]), /Cannot find/)
})

test('Windows fixed recipe binds downstream tools and clears missing optional replacements', t => {
    const { project, approved } = fixture(t)
    for (const tool of ['latexmk', 'pdflatex', 'kpsewhich']) fs.writeFileSync(path.join(approved, tool + '.exe'), '')
    const invocation = prepareWindowsBuild('latexmk', ['-pdf', 'main.tex'], {
        PATH: approved, LW_SECURE_BIBER: path.join(project, 'biber.exe'), LATEXWORKSHOP_DOCKER_PATH: 'inherited-docker-default'
    }, [project], 'extension-owned-policy')
    assert.equal(invocation.command, path.join(approved, 'latexmk.exe'))
    assert.deepEqual(invocation.args, ['-norc', '-r', 'extension-owned-policy', '-pdf', 'main.tex'])
    assert.equal(invocation.env.LW_SECURE_PDFLATEX, path.join(approved, 'pdflatex.exe'))
    assert.equal(invocation.env.LW_SECURE_BIBER, undefined)
    assert.equal(invocation.env.LW_SECURE_MAKEINDEX, undefined)
})

test('Windows native execution pins the approved executable despite a project decoy', { skip: process.platform !== 'win32' }, t => {
    const { root, project, approved } = fixture(t)
    const trusted = path.join(approved, 'latexmk.exe')
    fs.copyFileSync(process.execPath, trusted)
    fs.copyFileSync(process.execPath, path.join(project, 'latexmk.exe'))
    const capture = path.join(root, 'executed.txt')
    const args = ['-e', `require('fs').writeFileSync(${JSON.stringify(capture)}, process.execPath)`]
    const base = { ...process.env, PATH: approved }
    for (const key of Object.keys(base)) if (key.toLowerCase() === 'node_options' || key.toLowerCase() === 'node_repl_external_module') delete base[key]
    const env = windowsBuildEnvironment(base, [project])
    const resolved = resolveWindowsBuildTool('latexmk', env, [project])
    const invocation = windowsToolInvocation(resolved, args, env, [project])
    const result = spawnSync(invocation.command, invocation.args, { cwd: project, env: invocation.env })
    assert.equal(result.status, 0, String(result.stderr))
    assert.equal(fs.realpathSync(fs.readFileSync(capture, 'utf8')), fs.realpathSync(trusted))
})

test('Windows batch lookup reproduces legacy shadowing and the approved wrapper still runs', { skip: process.platform !== 'win32' }, t => {
    const { root, project, approved } = fixture(t)
    const capture = path.join(root, 'executed.txt')
    const name = 'lw-shadow-test'
    fs.writeFileSync(path.join(project, name + '.cmd'), '@echo off\r\n> "%LW_CAPTURE%" echo project\r\n')
    fs.writeFileSync(path.join(approved, name + '.cmd'), '@echo off\r\n> "%LW_CAPTURE%" echo approved\r\n')
    const base = { ...process.env, PATH: approved, LW_CAPTURE: capture }
    for (const key of Object.keys(base)) if (key.toLowerCase() === 'nodefaultcurrentdirectoryinexepath') delete base[key]
    const legacy = cs.sync(name, [], { cwd: project, env: base })
    assert.equal(legacy.status, 0, String(legacy.stderr))
    assert.equal(fs.readFileSync(capture, 'utf8').trim(), 'project', 'The old lookup must reproduce the benign trigger')
    fs.unlinkSync(capture)
    const env = windowsBuildEnvironment(base, [project])
    const invocation = windowsToolInvocation(resolveWindowsBuildTool(name, env, [project]), [], env, [project])
    const result = spawnSync(invocation.command, invocation.args, {
        cwd: project, env: invocation.env, windowsVerbatimArguments: invocation.windowsVerbatimArguments
    })
    assert.equal(result.status, 0, String(result.stderr))
    assert.equal(fs.readFileSync(capture, 'utf8').trim(), 'approved')
})

test('Windows Docker launch selects an absolute runtime and preserves wrapper arguments', { skip: process.platform !== 'win32' }, t => {
    const { root, project, approved } = fixture(t)
    const trusted = path.join(approved, 'docker.exe')
    fs.copyFileSync(process.execPath, trusted)
    fs.copyFileSync(process.execPath, path.join(project, 'docker.exe'))
    const capture = path.join(root, 'executed.json')
    const canary = path.join(root, 'capture.cjs')
    fs.writeFileSync(canary, `require('fs').writeFileSync(${JSON.stringify(capture)}, JSON.stringify({executable:process.execPath,args:process.argv.slice(1)})); process.exit(0);`)
    const invocation = prepareWindowsBuild(path.resolve(__dirname, '../../scripts/latexmk.bat'), ['-pdf', 'main file.tex'], {
        ...process.env, PATH: approved, NODE_OPTIONS: `--require ${JSON.stringify(canary)}`,
        LATEXWORKSHOP_DOCKER_PATH: 'docker', LATEXWORKSHOP_DOCKER_LATEX: 'example/texlive@sha256:test',
        LATEXWORKSHOP_DOCKER_SOURCE_DIR_HOST: project, LATEXWORKSHOP_DOCKER_OUTPUT_DIR_HOST: path.join(project, '.lw-security')
    }, [project], 'unused', 'docker')
    const result = spawnSync(invocation.command, invocation.args, {
        cwd: project, env: invocation.env, windowsVerbatimArguments: invocation.windowsVerbatimArguments
    })
    assert.equal(result.status, 0, String(result.stderr))
    const actual = JSON.parse(fs.readFileSync(capture, 'utf8'))
    assert.equal(fs.realpathSync(actual.executable), fs.realpathSync(trusted))
    assert.ok(actual.args.includes('--network=none'))
    assert.ok(actual.args.includes(`${project}:/latex-workshop/src:ro`))
    assert.deepEqual(actual.args.slice(-4), ['example/texlive@sha256:test', 'latexmk', '-pdf', 'main file.tex'])
})
