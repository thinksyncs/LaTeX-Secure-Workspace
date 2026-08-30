import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wrapper = path.join(repositoryRoot, 'scripts', 'latexmk')
const image = process.env.LATEXWORKSHOP_DOCKER_TEST_IMAGE ?? ''
const dockerPath = process.env.LATEXWORKSHOP_DOCKER_PATH ?? 'docker'
const fixedRecipeArguments = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'src', 'compile', 'fixedSecureRecipeArguments.json'), 'utf8')
)

function listFilesRecursively(directory) {
    return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const entryPath = path.join(directory, entry.name)
        return entry.isDirectory() ? listFilesRecursively(entryPath) : [entryPath]
    })
}

assert.match(
    image,
    /^[^@\s]+@sha256:[0-9a-f]{64}$/u,
    'LATEXWORKSHOP_DOCKER_TEST_IMAGE must use an immutable sha256 digest.'
)

const cases = [
    {
        name: 'pdflatex',
        enginePattern: /This is pdfTeX/u,
        body: [
            '\\documentclass{article}',
            '\\immediate\\write18{touch /latex-workshop/out/shell-escape-canary}',
            '\\begin{document}',
            'Secure pdfLaTeX Docker build.',
            '\\end{document}',
            ''
        ].join('\n')
    },
    {
        name: 'lualatex',
        enginePattern: /This is Lua(?:HB)?TeX/u,
        body: [
            '\\documentclass{article}',
            '\\usepackage{fontspec}',
            '\\setmainfont{Latin Modern Roman}',
            '\\immediate\\write18{touch /latex-workshop/out/shell-escape-canary}',
            '\\directlua{',
            '  local loaded = pcall(require, "socket")',
            '  if loaded then',
            '    error("Lua socket library unexpectedly enabled")',
            '  end',
            '  local source = "/latex-workshop/src/lualatex/source-write-canary"',
            '  local handle = io.open(source, "w")',
            '  if handle then',
            '    handle:write("source mount was writable")',
            '    handle:close()',
            '    error("Read-only source mount unexpectedly allowed a write")',
            '  end',
            '}',
            '\\begin{document}',
            'Secure LuaLaTeX Docker build.',
            '\\end{document}',
            ''
        ].join('\n')
    }
]

const workspace = mkdtempSync(path.join(tmpdir(), 'latex-workspace-docker-e2e-'))

try {
    for (const testCase of cases) {
        const projectDir = path.join(workspace, testCase.name)
        const outputDir = path.join(projectDir, '.lw-security')
        mkdirSync(outputDir, { recursive: true })
        writeFileSync(path.join(projectDir, 'main.tex'), testCase.body)

        const recipeArgs = [
            ...fixedRecipeArguments.commonArgsBeforeEngine,
            ...fixedRecipeArguments.engineArgs[testCase.name],
            ...fixedRecipeArguments.commonArgsAfterEngine
        ].map(arg => arg
            .replaceAll('%DOCFILE%', '/latex-workshop/out')
            .replaceAll('%DOC%', 'main'))

        const result = spawnSync(
            wrapper,
            recipeArgs,
            {
                cwd: projectDir,
                encoding: 'utf8',
                env: {
                    ...process.env,
                    LATEXWORKSHOP_DOCKER_PATH: dockerPath,
                    LATEXWORKSHOP_DOCKER_LATEX: image,
                    LATEXWORKSHOP_DOCKER_SOURCE_DIR_HOST: workspace,
                    LATEXWORKSHOP_DOCKER_SOURCE_DIR_CONTAINER: '/latex-workshop/src',
                    LATEXWORKSHOP_DOCKER_WORKDIR_CONTAINER: '/latex-workshop/src/' + testCase.name,
                    LATEXWORKSHOP_DOCKER_OUTPUT_DIR_HOST: outputDir,
                    LATEXWORKSHOP_DOCKER_OUTPUT_DIR_CONTAINER: '/latex-workshop/out'
                },
                maxBuffer: 20 * 1024 * 1024
            }
        )

        if (result.error) {
            throw result.error
        }
        assert.equal(
            result.status,
            0,
            testCase.name + ' Docker build failed.\n' + result.stdout + '\n' + result.stderr
        )

        const pdf = readFileSync(path.join(outputDir, 'main.pdf'))
        assert.equal(pdf.subarray(0, 5).toString(), '%PDF-', testCase.name + ' did not produce a PDF.')

        const log = readFileSync(path.join(outputDir, 'main.log'), 'utf8')
        assert.match(log, testCase.enginePattern, testCase.name + ' used the wrong TeX engine.')
        assert.ok(
            !readdirSync(outputDir).includes('shell-escape-canary'),
            testCase.name + ' unexpectedly allowed shell escape.'
        )
        assert.ok(
            !existsSync(path.join(projectDir, 'source-write-canary')),
            testCase.name + ' unexpectedly wrote through the read-only source mount.'
        )
        if (testCase.name === 'lualatex') {
            const cacheDir = path.join(outputDir, '.texlive-cache')
            assert.ok(existsSync(cacheDir), 'lualatex did not create its isolated TeX cache.')
            assert.ok(statSync(cacheDir).isDirectory(), 'lualatex TeX cache path is not a directory.')
            assert.ok(
                listFilesRecursively(cacheDir).length > 0,
                'lualatex did not populate its isolated TeX cache.'
            )
        }
        assert.deepEqual(
            readdirSync(projectDir).sort(),
            ['.lw-security', 'main.tex'],
            testCase.name + ' wrote outside the isolated output directory.'
        )

        console.log(testCase.name + ': Docker-isolated build passed')
    }
} finally {
    rmSync(workspace, { recursive: true, force: true })
}
