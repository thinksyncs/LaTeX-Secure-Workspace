#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultMinutes = 24 * 60
const maxFilesPerGroup = 200
const crashFilePattern = /\.(?:crash|ips|diag|log)$/i
const crashNamePattern = /(?:Code Helper|Visual Studio Code|Code|Electron|LaTeX|pdf|renderer)/i
const logFilePattern = /\.(?:log|txt|json)$/i

function usage() {
    return [
        'Usage: npm run diagnose:pdf-viewer -- [--pdf path/to/repro.pdf] [--out artifacts/pdf-viewer-crash/name] [--minutes 1440]',
        '',
        'Collects a local artifact bundle for PDF viewer renderer exits.',
        'Run it soon after the crash so DiagnosticReports and VS Code logs are still recent.'
    ].join('\n')
}

function parseArgs(argv) {
    const options = {
        pdfs: [],
        minutes: defaultMinutes,
        outDir: undefined,
        help: false
    }

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index]
        if (arg === '--help' || arg === '-h') {
            options.help = true
        } else if (arg === '--pdf') {
            index += 1
            if (!argv[index]) {
                throw new Error('--pdf requires a file path')
            }
            options.pdfs.push(argv[index])
        } else if (arg === '--out') {
            index += 1
            if (!argv[index]) {
                throw new Error('--out requires a directory path')
            }
            options.outDir = argv[index]
        } else if (arg === '--minutes') {
            index += 1
            const minutes = Number(argv[index])
            if (!Number.isFinite(minutes) || minutes <= 0) {
                throw new Error('--minutes requires a positive number')
            }
            options.minutes = minutes
        } else {
            throw new Error(`Unknown argument: ${arg}`)
        }
    }

    return options
}

function formatTimestamp(date) {
    return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function sanitizeSegment(segment) {
    let sanitized = ''
    for (const character of segment) {
        const code = character.charCodeAt(0)
        sanitized += code < 32 || '<>:"|?*'.includes(character) ? '_' : character
    }
    return sanitized || '_'
}

function safeRelativePath(baseDir, filePath) {
    return path.relative(baseDir, filePath).split(path.sep).map(sanitizeSegment).join(path.sep)
}

async function pathExists(filePath) {
    try {
        await fs.access(filePath)
        return true
    } catch {
        return false
    }
}

async function sha256File(filePath) {
    const hash = createHash('sha256')
    await new Promise((resolve, reject) => {
        const stream = createReadStream(filePath)
        stream.on('data', chunk => hash.update(chunk))
        stream.on('error', reject)
        stream.on('end', resolve)
    })
    return hash.digest('hex')
}

async function copyFileToBundle({ source, destinationRoot, destinationRelativePath, kind, manifest, hash = false }) {
    const stat = await fs.stat(source)
    if (!stat.isFile()) {
        return false
    }

    const destination = path.join(destinationRoot, destinationRelativePath)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(source, destination)

    const entry = {
        kind,
        source,
        artifact: path.relative(destinationRoot, destination),
        bytes: stat.size,
        mtime: stat.mtime.toISOString()
    }
    if (hash) {
        entry.sha256 = await sha256File(source)
    }
    manifest.files.push(entry)
    return true
}

async function* walkFiles(rootDir, maxDepth = 8, depth = 0) {
    let entries
    try {
        entries = await fs.readdir(rootDir, { withFileTypes: true })
    } catch {
        return
    }

    for (const entry of entries) {
        const entryPath = path.join(rootDir, entry.name)
        if (entry.isDirectory() && depth < maxDepth) {
            yield* walkFiles(entryPath, maxDepth, depth + 1)
        } else if (entry.isFile()) {
            yield entryPath
        }
    }
}

function macOsCrashReportDirs() {
    const homeDir = os.homedir()
    return [
        path.join(homeDir, 'Library', 'Logs', 'DiagnosticReports'),
        path.join(homeDir, 'Library', 'Logs', 'CrashReporter'),
        path.join('/Library', 'Logs', 'DiagnosticReports')
    ]
}

function vsCodeLogDirs() {
    const homeDir = os.homedir()
    return [
        path.join(workspaceRoot, 'test', 'log'),
        path.join(workspaceRoot, '.vscode-test'),
        path.join(homeDir, 'Library', 'Application Support', 'Code', 'logs'),
        path.join(homeDir, 'Library', 'Application Support', 'Code - Insiders', 'logs')
    ]
}

async function collectRecentFiles({ dirs, sinceMs, pattern, namePattern, destinationRoot, subdir, kind, manifest }) {
    let copied = 0
    for (const dir of dirs) {
        if (copied >= maxFilesPerGroup) {
            break
        }
        if (!await pathExists(dir)) {
            manifest.missingSources.push(dir)
            continue
        }
        manifest.scannedSources.push(dir)
        for await (const filePath of walkFiles(dir)) {
            if (copied >= maxFilesPerGroup) {
                break
            }
            const stat = await fs.stat(filePath)
            if (stat.mtimeMs < sinceMs) {
                continue
            }
            if (!pattern.test(path.basename(filePath))) {
                continue
            }
            if (namePattern && !namePattern.test(filePath)) {
                continue
            }
            const relativePath = path.join(subdir, safeRelativePath(dir, filePath))
            if (await copyFileToBundle({
                source: filePath,
                destinationRoot,
                destinationRelativePath: relativePath,
                kind,
                manifest
            })) {
                copied += 1
            }
        }
    }
    return copied
}

async function copyReproPdfs(pdfs, outDir, manifest) {
    for (const pdf of pdfs) {
        const source = path.resolve(workspaceRoot, pdf)
        if (!await pathExists(source)) {
            manifest.warnings.push(`Missing repro PDF: ${source}`)
            continue
        }
        const destinationRelativePath = path.join('repro-pdf', sanitizeSegment(path.basename(source)))
        await copyFileToBundle({
            source,
            destinationRoot: outDir,
            destinationRelativePath,
            kind: 'repro-pdf',
            manifest,
            hash: true
        })
    }
}

async function writeSystemInfo(outDir, manifest) {
    const packageJsonPath = path.join(workspaceRoot, 'package.json')
    const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
    const systemInfo = {
        collectedAt: manifest.collectedAt,
        workspaceRoot,
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        os: {
            type: os.type(),
            release: os.release(),
            version: os.version()
        },
        package: {
            name: packageJson.name,
            version: packageJson.version,
            engines: packageJson.engines
        }
    }
    await fs.writeFile(path.join(outDir, 'system-info.json'), JSON.stringify(systemInfo, null, 2) + '\n')
}

async function main() {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
        console.log(usage())
        return
    }

    const now = new Date()
    const outDir = path.resolve(workspaceRoot, options.outDir ?? path.join('artifacts', 'pdf-viewer-crash', formatTimestamp(now)))
    const sinceMs = now.getTime() - options.minutes * 60 * 1000
    const manifest = {
        collectedAt: now.toISOString(),
        minutes: options.minutes,
        files: [],
        scannedSources: [],
        missingSources: [],
        warnings: []
    }

    await fs.mkdir(outDir, { recursive: true })
    await copyReproPdfs(options.pdfs, outDir, manifest)

    if (process.platform === 'darwin') {
        await collectRecentFiles({
            dirs: macOsCrashReportDirs(),
            sinceMs,
            pattern: crashFilePattern,
            namePattern: crashNamePattern,
            destinationRoot: outDir,
            subdir: 'macos-crash-reports',
            kind: 'macos-crash-report',
            manifest
        })
    } else {
        manifest.warnings.push('macOS DiagnosticReports collection was skipped because this host is not macOS.')
    }

    await collectRecentFiles({
        dirs: vsCodeLogDirs(),
        sinceMs,
        pattern: logFilePattern,
        namePattern: undefined,
        destinationRoot: outDir,
        subdir: 'vscode-logs',
        kind: 'vscode-log',
        manifest
    })

    await writeSystemInfo(outDir, manifest)
    await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')

    console.log(`Wrote PDF viewer crash artifact bundle: ${outDir}`)
    console.log(`Copied ${manifest.files.length} file(s).`)
    if (manifest.warnings.length > 0) {
        console.log('Warnings:')
        for (const warning of manifest.warnings) {
            console.log(`- ${warning}`)
        }
    }
}

main().catch(error => {
    console.error(error.message)
    console.error(usage())
    process.exit(1)
})
