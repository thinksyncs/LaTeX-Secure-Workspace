import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = path.resolve(process.argv[2])
const pdf = path.join(root, 'project with spaces', '.lw-security', 't.pdf')
const reportFile = path.join(root, 'qa-report.json')
const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'))
const checks = {}
for (const [tool, args] of [
    ['qpdf', ['--check', pdf]],
    ['gs', ['-dSAFER', '-dBATCH', '-dNOPAUSE', '-sDEVICE=nullpage', pdf]]
]) {
    const result = spawnSync(tool, args, { encoding: 'utf8' })
    const output = (result.stdout ?? '') + (result.stderr ?? '')
    assert.equal(result.status, 0, `${tool}: ${output}`)
    assert.doesNotMatch(output, /warning|repaired|incorrect\s+xref|recursive\s+dict|error:/i)
    checks[tool] = { exitCode: result.status, output }
}
report.pdfStructure = { status: 'passed', checks }
fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n')
console.log('PDF structure passed qpdf and Ghostscript without warnings.')
