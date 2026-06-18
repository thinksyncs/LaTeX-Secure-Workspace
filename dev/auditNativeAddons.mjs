#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const nativeDependencyNames = new Set([
    '@mapbox/node-pre-gyp',
    'node-gyp',
    'node-gyp-build',
    'node-pre-gyp',
    'prebuild-install',
    'prebuildify'
])
const nativeScriptPattern = /\b(?:node-gyp|node-pre-gyp|prebuild|prebuild-install)\b|\.node\b/

function packageNameFromLockPath(lockPath) {
    const normalizedPath = lockPath.replace(/^node_modules\//, '')
    const parts = normalizedPath.split('/node_modules/')
    return parts[parts.length - 1]
}

function findNativeIndicators(pkg) {
    const indicators = []
    const dependencyGroups = [
        pkg.dependencies ?? {},
        pkg.optionalDependencies ?? {},
        pkg.devDependencies ?? {}
    ]

    if (pkg.gypfile) {
        indicators.push('gypfile')
    }

    for (const dependencies of dependencyGroups) {
        for (const dependencyName of Object.keys(dependencies)) {
            if (nativeDependencyNames.has(dependencyName)) {
                indicators.push(`dependency:${dependencyName}`)
            }
        }
    }

    for (const [scriptName, script] of Object.entries(pkg.scripts ?? {})) {
        if (nativeScriptPattern.test(String(script))) {
            indicators.push(`script:${scriptName}`)
        }
    }

    return indicators
}

async function main() {
    const lockPath = path.join(workspaceRoot, 'package-lock.json')
    const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'))
    const packages = lock.packages ?? {}
    const nativePackages = []

    for (const [lockPackagePath, pkg] of Object.entries(packages)) {
        if (!lockPackagePath.startsWith('node_modules/')) {
            continue
        }
        const indicators = findNativeIndicators(pkg)
        if (indicators.length === 0) {
            continue
        }
        nativePackages.push({
            name: packageNameFromLockPath(lockPackagePath),
            lockPath: lockPackagePath,
            devOnly: pkg.dev === true,
            indicators
        })
    }

    const runtimeNativePackages = nativePackages.filter(pkg => !pkg.devOnly)
    console.log('Native/prebuild dependency audit')
    if (nativePackages.length === 0) {
        console.log('No native addon indicators found in package-lock.json.')
        return
    }

    for (const pkg of nativePackages) {
        const scope = pkg.devOnly ? 'dev-only' : 'runtime'
        console.log(`- ${pkg.name} (${scope}): ${pkg.indicators.join(', ')}`)
    }

    if (runtimeNativePackages.length > 0) {
        console.error('Runtime native addon indicators found. Keep extension runtime dependencies JavaScript-only unless explicitly reviewed.')
        process.exit(1)
    }

    console.log('No runtime native addon indicators found.')
}

main().catch(error => {
    console.error(error.message)
    process.exit(1)
})
