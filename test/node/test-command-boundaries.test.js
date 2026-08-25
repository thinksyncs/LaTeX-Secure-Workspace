'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const test = require('node:test')

const packageJson = require(path.resolve(__dirname, '../../package.json'))
const unixDockerWrapper = fs.readFileSync(path.resolve(__dirname, '../../scripts/latexmk'), 'utf8')
const windowsDockerWrapper = fs.readFileSync(path.resolve(__dirname, '../../scripts/latexmk.bat'), 'utf8')

test('default tests do not launch a VS Code Extension Host', () => {
  assert.equal(packageJson.scripts.test, 'npm run test:node')
  assert.doesNotMatch(packageJson.scripts['test:node'], /runTestCi|test:integration|test:ci/)
})

test('CI, coverage, and release verification retain integration tests', () => {
  assert.match(packageJson.scripts['test:ci'], /npm run test:integration/)
  assert.match(packageJson.scripts.coverage, /npm run test:integration/)
  assert.match(packageJson.scripts['release:verify'], /npm run test:ci/)
})

test('Docker wrappers keep source read-only and output on a separate mount', () => {
  for (const wrapper of [unixDockerWrapper, windowsDockerWrapper]) {
    assert.match(wrapper, /--pull=never/)
    assert.match(wrapper, /--network=none/)
    assert.match(wrapper, /--cap-drop=ALL/)
    assert.match(wrapper, /--security-opt=no-new-privileges/)
    assert.match(wrapper, /LATEXWORKSHOP_DOCKER_SOURCE_DIR_HOST/)
    assert.match(wrapper, /LATEXWORKSHOP_DOCKER_WORKDIR_CONTAINER/)
    assert.match(wrapper, /LATEXWORKSHOP_DOCKER_OUTPUT_DIR_HOST/)
  }
  assert.match(unixDockerWrapper, /-v "\$SOURCE_DIR_HOST:\$SOURCE_DIR_CONTAINER:ro"/)
  assert.doesNotMatch(unixDockerWrapper, /-v "\$\(pwd\):\$SOURCE_DIR_CONTAINER:ro"/)
  assert.match(windowsDockerWrapper, /-v "%LATEXWORKSHOP_DOCKER_SOURCE_DIR_HOST%:%LATEXWORKSHOP_DOCKER_SOURCE_DIR_CONTAINER%:ro"/)
  assert.doesNotMatch(windowsDockerWrapper, /-v "%cd%:%LATEXWORKSHOP_DOCKER_SOURCE_DIR_CONTAINER%:ro"/)
  assert.match(windowsDockerWrapper, /-w "%LATEXWORKSHOP_DOCKER_WORKDIR_CONTAINER%"/)
  assert.doesNotMatch(windowsDockerWrapper, /-w %LATEXWORKSHOP_DOCKER_WORKDIR_CONTAINER%/)
})

test('Unix Docker wrapper forwards only the workspace and output host mounts', {
  skip: process.platform === 'win32'
}, t => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-docker-wrapper-'))
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }))
  const workspaceDir = path.join(tempDir, 'workspace')
  const rootDir = path.join(workspaceDir, 'paper')
  const outputDir = path.join(rootDir, '.lw-security')
  const capturePath = path.join(tempDir, 'args.txt')
  const runtimePath = path.join(tempDir, 'fake-docker')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(runtimePath, [
    '#!/bin/sh',
    'printf "%s\\n" "$@" > "$LW_CAPTURE"'
  ].join('\n'))
  fs.chmodSync(runtimePath, 0o755)

  const result = spawnSync(path.resolve(__dirname, '../../scripts/latexmk'), ['-pdf', 'main'], {
    cwd: rootDir,
    env: {
      ...process.env,
      LATEXWORKSHOP_DOCKER_PATH: runtimePath,
      LATEXWORKSHOP_DOCKER_LATEX: 'example/texlive@sha256:test',
      LATEXWORKSHOP_DOCKER_SOURCE_DIR_HOST: workspaceDir,
      LATEXWORKSHOP_DOCKER_SOURCE_DIR_CONTAINER: '/latex-workshop/src',
      LATEXWORKSHOP_DOCKER_WORKDIR_CONTAINER: '/latex-workshop/src/paper',
      LATEXWORKSHOP_DOCKER_OUTPUT_DIR_HOST: outputDir,
      LATEXWORKSHOP_DOCKER_OUTPUT_DIR_CONTAINER: '/latex-workshop/out',
      LW_CAPTURE: capturePath
    }
  })
  assert.equal(result.status, 0, result.stderr.toString())
  const args = fs.readFileSync(capturePath, 'utf8').trim().split('\n')
  assert.equal(args[args.indexOf('-w') + 1], '/latex-workshop/src/paper')
  assert.deepEqual(
    args.filter(arg => arg.includes(':/latex-workshop/')).sort(),
    [workspaceDir + ':/latex-workshop/src:ro', outputDir + ':/latex-workshop/out'].sort()
  )
  assert.deepEqual(args.slice(-4), ['example/texlive@sha256:test', 'latexmk', '-pdf', 'main'])
})
