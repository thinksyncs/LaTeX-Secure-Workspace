import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const workspaceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const devTestFiles = Object.freeze([
    './test/dev/runTest.test.cjs',
    './test/dev/runTestCi.test.cjs',
    './test/dev/resolvePublishPlan.test.cjs',
])

export function runDevTests({ cwd = workspaceRoot, env = process.env } = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--test', ...devTestFiles], {
            cwd,
            env,
            stdio: 'inherit'
        })

        child.on('error', reject)
        child.on('close', code => {
            if (code === 0) {
                resolve()
                return
            }
            reject(new Error(`Dev node:test suite failed with exit code ${code ?? 1}.`))
        })
    })
}

async function main() {
    await runDevTests()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(error.message)
        process.exit(1)
    })
}
