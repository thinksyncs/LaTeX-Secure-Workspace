'use strict'

const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const packageJson = require(path.resolve(__dirname, '../../package.json'))

test('default tests do not launch a VS Code Extension Host', () => {
  assert.equal(packageJson.scripts.test, 'npm run test:node')
  assert.doesNotMatch(packageJson.scripts['test:node'], /runTestCi|test:integration|test:ci/)
})

test('CI, coverage, and release verification retain integration tests', () => {
  assert.match(packageJson.scripts['test:ci'], /npm run test:integration/)
  assert.match(packageJson.scripts.coverage, /npm run test:integration/)
  assert.match(packageJson.scripts['release:verify'], /npm run test:ci/)
})
