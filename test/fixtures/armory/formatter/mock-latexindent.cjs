#!/usr/bin/env node

const fs = require('fs')

const args = process.argv.slice(2)
const indentArg = args.find(arg => arg.includes('defaultIndent:'))
const indentMatch = indentArg && /defaultIndent:\s*'([^']*)'/.exec(indentArg)
const indent = indentMatch ? indentMatch[1] : '    '
const filePath = [...args].reverse().find(arg => fs.existsSync(arg))

if (!filePath) {
    console.error('mock-latexindent: missing input file')
    process.exit(1)
}

const content = fs.readFileSync(filePath, 'utf8')
let depth = 0
const formatted = content.split('\n').map(line => {
    const trimmed = line.trim()
    if (trimmed.startsWith('\\end')) {
        depth = Math.max(depth - 1, 0)
    }
    const normalized = trimmed === '' ? '' : indent.repeat(depth) + trimmed
    if (trimmed.startsWith('\\begin')) {
        depth += 1
    }
    return normalized
}).join('\n')

process.stdout.write(formatted)
