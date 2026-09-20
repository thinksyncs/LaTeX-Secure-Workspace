import * as fs from 'fs'

// LaunchServices does not forward the test host's exit code to `open -W`.
// The host must explicitly report completion to its private result file.
export async function reportTestResult(run: Promise<void>, resultFile = process.env.LATEXWORKSHOP_TEST_RESULT_FILE): Promise<void> {
    try {
        await run
    } catch (error) {
        if (resultFile) {
            fs.writeFileSync(resultFile, JSON.stringify({status: 'failed'}))
        }
        throw error
    }
    if (resultFile) {
        fs.writeFileSync(resultFile, JSON.stringify({status: 'passed'}))
    }
}

export function verifyTestResult(resultFile: string): void {
    if (!fs.existsSync(resultFile)) {
        throw new Error('The VS Code test host exited without reporting test completion.')
    }
    const result = JSON.parse(fs.readFileSync(resultFile, 'utf8')) as {status?: string}
    if (result.status !== 'passed') {
        throw new Error('The VS Code test host reported failing tests.')
    }
    console.log('VS Code test host reported successful completion.')
}
