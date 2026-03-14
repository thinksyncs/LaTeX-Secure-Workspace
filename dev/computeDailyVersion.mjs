import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const runNumber = Number.parseInt(process.env.GITHUB_RUN_NUMBER ?? '', 10)

if (!Number.isInteger(runNumber) || runNumber < 1) {
    throw new Error(`Invalid GITHUB_RUN_NUMBER: ${process.env.GITHUB_RUN_NUMBER ?? '<unset>'}`)
}

const versionParts = String(pkg.version).split('.')
if (versionParts.length < 2 || versionParts.length > 3 || versionParts.some(part => !/^\d+$/.test(part))) {
    throw new Error(`Stable version must be numeric major.minor[.patch], got ${pkg.version}`)
}

const major = Number.parseInt(versionParts[0], 10)
const minor = Number.parseInt(versionParts[1], 10)
const dailyVersion = `${major}.${minor + 1}.${runNumber}`

process.stdout.write(`package_name=${pkg.name}\n`)
process.stdout.write(`stable_version=${pkg.version}\n`)
process.stdout.write(`daily_version=${dailyVersion}\n`)
