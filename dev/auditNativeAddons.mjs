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
const nativePackageNamePattern = /^@(?:napi-rs|node-rs)\//
const reviewedPdfjsCanvasReason = 'optional pdfjs-dist Node.js canvas backend; excluded from the browser-only VSIX payload'

function packageNameFromLockPath(lockPath) {
    const normalizedPath = lockPath.replace(/^node_modules\//, '')
    const parts = normalizedPath.split('/node_modules/')
    return parts[parts.length - 1]
}

function findNativeIndicators(packageName, pkg) {
    const indicators = []
    const dependencyGroups = [
        pkg.dependencies ?? {},
        pkg.optionalDependencies ?? {},
        pkg.devDependencies ?? {}
    ]

    if (pkg.gypfile) {
        indicators.push('gypfile')
    }
    if (nativePackageNamePattern.test(packageName)) {
        indicators.push('package:native-prebuild-family')
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

function getReviewedRuntimeNativePackages(packages) {
    const pdfjsOptionalDependencies = packages['node_modules/pdfjs-dist']?.optionalDependencies ?? {}
    if (!Object.hasOwn(pdfjsOptionalDependencies, '@napi-rs/canvas')) {
        return new Map()
    }
    const canvasOptionalDependencies = packages['node_modules/@napi-rs/canvas']?.optionalDependencies ?? {}
    return new Map([
        ['@napi-rs/canvas', reviewedPdfjsCanvasReason],
        ...Object.keys(canvasOptionalDependencies).map(packageName => [packageName, reviewedPdfjsCanvasReason])
    ])
}

function unignoreRuleCouldIncludePackage(rule, packageName) {
    if (!rule.startsWith('!node_modules/')) {
        return false
    }
    const packagePath = `node_modules/${packageName}`
    const staticPrefix = rule.slice(1).split('*', 1)[0]
    return packagePath.startsWith(staticPrefix) || staticPrefix.startsWith(`${packagePath}/`)
}

async function verifyReviewedRuntimeExclusions(reviewedPackages) {
    if (reviewedPackages.length === 0) {
        return
    }
    const ignorePath = path.join(workspaceRoot, '.vscodeignore')
    const ignoreRules = (await fs.readFile(ignorePath, 'utf8'))
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line !== '' && !line.startsWith('#'))

    if (!ignoreRules.includes('node_modules/**')) {
        throw new Error('.vscodeignore must exclude node_modules/** before reviewed browser assets are selectively included.')
    }
    for (const pkg of reviewedPackages) {
        const includingRules = ignoreRules.filter(rule => unignoreRuleCouldIncludePackage(rule, pkg.name))
        if (includingRules.length > 0) {
            throw new Error(`Reviewed native package ${pkg.name} may be included by .vscodeignore rule(s): ${includingRules.join(', ')}`)
        }
    }
}

async function main() {
    const lockPath = path.join(workspaceRoot, 'package-lock.json')
    const lock = JSON.parse(await fs.readFile(lockPath, 'utf8'))
    const packages = lock.packages ?? {}
    const reviewedRuntimePackagesByName = getReviewedRuntimeNativePackages(packages)
    const nativePackages = []

    for (const [lockPackagePath, pkg] of Object.entries(packages)) {
        if (!lockPackagePath.startsWith('node_modules/')) {
            continue
        }
        const packageName = packageNameFromLockPath(lockPackagePath)
        const indicators = findNativeIndicators(packageName, pkg)
        if (indicators.length === 0) {
            continue
        }
        nativePackages.push({
            name: packageName,
            lockPath: lockPackagePath,
            devOnly: pkg.dev === true,
            indicators,
            reviewedRuntimeReason: pkg.dev === true ? undefined : reviewedRuntimePackagesByName.get(packageName)
        })
    }

    const runtimeNativePackages = nativePackages.filter(pkg => !pkg.devOnly)
    const reviewedRuntimePackages = runtimeNativePackages.filter(pkg => pkg.reviewedRuntimeReason !== undefined)
    const unreviewedRuntimePackages = runtimeNativePackages.filter(pkg => pkg.reviewedRuntimeReason === undefined)
    await verifyReviewedRuntimeExclusions(reviewedRuntimePackages)

    console.log('Native/prebuild dependency audit')
    if (nativePackages.length === 0) {
        console.log('No native addon indicators found in package-lock.json.')
        return
    }

    for (const pkg of nativePackages) {
        const scope = pkg.devOnly ? 'dev-only' : pkg.reviewedRuntimeReason ? 'runtime, reviewed and VSIX-excluded' : 'runtime'
        const reason = pkg.reviewedRuntimeReason ? `; ${pkg.reviewedRuntimeReason}` : ''
        console.log(`- ${pkg.name} (${scope}): ${pkg.indicators.join(', ')}${reason}`)
    }

    if (unreviewedRuntimePackages.length > 0) {
        console.error('Unreviewed runtime native addon indicators found. Keep the shipped extension runtime JavaScript-only unless explicitly reviewed and excluded.')
        process.exit(1)
    }

    if (reviewedRuntimePackages.length > 0) {
        console.log('No unreviewed native addon indicators are eligible for the VSIX payload.')
    } else {
        console.log('No runtime native addon indicators found.')
    }
}

main().catch(error => {
    console.error(error.message)
    process.exit(1)
})
