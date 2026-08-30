import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const wrapper = path.join(repositoryRoot, 'scripts', 'latexmk')
const image = process.env.LATEXWORKSHOP_DOCKER_TEST_IMAGE ?? ''
const dockerPath = process.env.LATEXWORKSHOP_DOCKER_PATH ?? 'docker'

assert.match(
    image,
    /^[^@\s]+@sha256:[0-9a-f]{64}$/u,
    'LATEXWORKSHOP_DOCKER_TEST_IMAGE must use an immutable sha256 digest.'
)

const cases = [
    {
        name: 'pdflatex',
        engineArgs: ['-pdf'],
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
        engineArgs: ['-lualatex', '-latexoption=--no-socket'],
        enginePattern: /This is Lua(?:HB)?TeX/u,
        body: [
            '\\documentclass{article}',
            '\\immediate\\write18{touch /latex-workshop/out/shell-escape-canary}',
            '\\directlua{',
            '  local loaded = pcall(require, "socket")',
            '  if loaded then',
            '    error("Lua socket library unexpectedly enabled")',
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

        const result = spawnSync(
            wrapper,
            [
                '-norc',
                '-no-shell-escape',
                '-synctex=1',
                '-interaction=nonstopmode',
                '-file-line-error',
                ...testCase.engineArgs,
                '-outdir=/latex-workshop/out',
                '-auxdir=/latex-workshop/out',
                'main'
            ],
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
