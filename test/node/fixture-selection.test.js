'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')
const os = require('node:os')

function loadTypescriptModule(relativePath) {
  const filename = path.resolve(__dirname, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
    fileName: filename
  }).outputText
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(output, filename)
  return mod.exports
}

const { selectTestFixtures } = loadTypescriptModule('../fixture-selection.ts')

test('runs all fixtures by default', () => {
  assert.deepEqual(selectTestFixtures({}), ['unittest', 'testground', 'multiroot'])
})

test('runs only the unit fixture for a unit filter', () => {
  assert.deepEqual(selectTestFixtures({ LATEXWORKSHOP_UNIT: '08_compile_build' }), ['unittest'])
})

test('runs only the matching suite fixture', () => {
  assert.deepEqual(selectTestFixtures({ LATEXWORKSHOP_SUITE: '05_viewer' }), ['testground'])
  assert.deepEqual(selectTestFixtures({ LATEXWORKSHOP_SUITE: '99_multiroot' }), ['multiroot'])
})

test('keeps both requested groups without unrelated fixtures', () => {
  assert.deepEqual(
    selectTestFixtures({ LATEXWORKSHOP_UNIT: '08_compile_build', LATEXWORKSHOP_SUITE: '99_multiroot' }),
    ['unittest', 'multiroot']
  )
})

test('background completion requires a positive result from the test host', async t => {
  const { reportTestResult, verifyTestResult } = loadTypescriptModule('../result.ts')
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'lw-test-result-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const resultFile = path.join(directory, 'result.json')
  assert.throws(() => verifyTestResult(resultFile), /without reporting/)
  await assert.rejects(reportTestResult(Promise.reject(new Error('controlled failure')), resultFile), /controlled failure/)
  assert.throws(() => verifyTestResult(resultFile), /failing tests/)
  await reportTestResult(Promise.resolve(), resultFile)
  assert.doesNotThrow(() => verifyTestResult(resultFile))
})
