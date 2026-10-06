'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const test = require('node:test')
const ts = require('typescript')
const picomatch = require('picomatch')

// Exercise the actual configuration-to-matcher functions without starting VS Code.
function loadMatcher(file, name, platform = 'linux') {
    const source = fs.readFileSync(path.resolve(__dirname, '../..', file), 'utf8')
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
    let found
    function visit(node) {
        if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name?.getText(ast) === name) found = node
        ts.forEachChild(node, visit)
    }
    visit(ast)
    assert.ok(found)
    const method = ts.isMethodDeclaration(found)
    const code = ts.transpileModule(method ? `class Matcher { ${found.getText(ast)} }` : found.getText(ast), {
        compilerOptions: { target: ts.ScriptTarget.ES2021 }
    }).outputText
    const state = { patterns: [] }
    const context = {
        picomatch, os: { platform: () => platform }, path: platform === 'win32' ? path.win32 : path.posix,
        lw: { file: { toUri: file => ({ fsPath: file }) } }, ignoreFiles: ['**/.vscode', '**/.vscodeignore', '**/.gitignore'],
        vscode: { workspace: { getConfiguration: section => ({ get: () => section === 'files' ? {} : state.patterns }) } },
    }
    const matcher = vm.runInNewContext(code + (method ? '\nnew Matcher()' : `\n${name}`), context)
    return (filePath, patterns) => {
        state.patterns = patterns
        return method
            ? matcher[name]({}, [filePath], platform === 'win32' ? 'C:\\repo' : '/repo').length === 0
            : matcher(filePath)
    }
}

const callers = [
    ['src/core/cache.ts', 'isExcluded'],
    ['src/compile/build.ts', 'isFileExcludedFromBuildOnSave'],
    ['src/completion/completer/input.ts', 'filterIgnoredFiles'],
]

for (const [file, name] of callers) {
    test(`${name} preserves glob alternatives, negation, ranges and empty lists`, () => {
        const match = loadMatcher(file, name)
        // Expected results were checked against micromatch 4.0.8 before removal.
        for (const [input, patterns, expected] of [
            ['/repo/main.tex', ['**/*.{tex,bib}'], true],
            ['/repo/main.bib', ['**/*.{tex,bib}'], true],
            ['/repo/main.aux', ['**/*.{tex,bib}'], false],
            ['/repo/chapter2.tex', ['**/chapter{1..3}.tex'], true],
            ['/repo/chapter4.tex', ['**/chapter{1..3}.tex'], false],
            ['/repo/main.tex', ['**/*.tex', '!**/main.tex'], true],
            ['/repo/main.bib', ['**/*.tex', '!**/*.bib'], false],
            ['/repo/.hidden.tex', ['**/*.tex'], false],
            ['/repo/main.tex', ['**/@(main|intro).tex'], true],
            ['/repo/other.tex', ['**/!(main).tex'], true],
            ['/repo/{literal}.tex', ['**/\\{literal\\}.tex'], true],
            ['/repo/main.tex', [], false],
            ['/日本語/本文.tex', ['**/*.tex'], true],
        ]) assert.equal(match(input, patterns), expected, `${input}: ${patterns}`)
    })

    test(`${name} preserves Windows paths and basename handling`, () => {
        const match = loadMatcher(file, name, 'win32')
        assert.equal(match('C:\\日本語\\本文.tex', ['**/*.tex']), true)
        assert.equal(match('C:\\日本語\\本文.tex', ['**/*.bib']), false)
        if (name === 'filterIgnoredFiles') {
            assert.equal(match('C:\\repo\\main.tex', ['main.tex']), true)
            assert.equal(match('C:\\repo\\main.tex', ['other.tex']), false)
        }
    })

    test(`${name} handles deeply nested patterns without recursive brace expansion`, () => {
        const match = loadMatcher(file, name)
        for (const pattern of ['{'.repeat(4000) + 'a,b' + '}'.repeat(4000), '{a,'.repeat(2000) + 'b' + '}'.repeat(2000)]) {
            assert.equal(vm.runInNewContext('match("/repo/main.tex", [pattern])', { match, pattern }, { timeout: 3000 }), false)
        }
    })
}

test('watcher and build ignore lists retain first-match short-circuiting', () => {
    for (const [file, name] of callers.slice(0, 2)) {
        assert.equal(loadMatcher(file, name)('/repo/main.tex', ['**/*.tex', '']), true)
    }
})

test('production and development lockfile entries no longer include braces or micromatch', () => {
    const lock = require('../../package-lock.json')
    const forbidden = Object.keys(lock.packages).filter(name => /(?:^|\/)node_modules\/(?:braces|micromatch)$/.test(name))
    assert.deepEqual(forbidden, [])
})
