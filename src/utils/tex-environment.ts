import * as cs from 'cross-spawn'

export type TexToolDefinition = {
    command: string,
    args: string[],
    purpose: string,
    requiredForBuild: boolean
}

export type TexToolStatus = TexToolDefinition & {
    available: boolean,
    summary?: string,
    error?: string
}

type TexToolResult = {
    error?: Error | null,
    status: number | null,
    stdout?: Buffer | string | null,
    stderr?: Buffer | string | null
}

export type TexToolRunner = (
    command: string,
    args: readonly string[],
    options: { encoding: 'utf8', timeout: number, windowsHide: boolean }
) => TexToolResult

export const TEX_TOOL_DEFINITIONS: readonly TexToolDefinition[] = [
    {
        command: 'latexmk',
        args: ['-version'],
        purpose: 'secure build driver',
        requiredForBuild: true
    },
    {
        command: 'pdflatex',
        args: ['--version'],
        purpose: 'PDF LaTeX engine',
        requiredForBuild: true
    },
    {
        command: 'kpsewhich',
        args: ['--version'],
        purpose: 'TeX file lookup',
        requiredForBuild: false
    },
    {
        command: 'synctex',
        args: ['--version'],
        purpose: 'source/PDF synchronization',
        requiredForBuild: false
    }
]

export const REQUIRED_BUILD_TOOL_DEFINITIONS = TEX_TOOL_DEFINITIONS.filter(tool => tool.requiredForBuild)

const defaultRunner: TexToolRunner = (command, args, options) => cs.sync(command, args, options)

export function inspectTexEnvironment(
    runner: TexToolRunner = defaultRunner,
    definitions: readonly TexToolDefinition[] = TEX_TOOL_DEFINITIONS
): TexToolStatus[] {
    return definitions.map(definition => {
        let result: TexToolResult
        try {
            result = runner(definition.command, definition.args, {
                encoding: 'utf8',
                timeout: 5000,
                windowsHide: true
            })
        } catch (error) {
            return {
                ...definition,
                available: false,
                error: error instanceof Error ? error.message : String(error)
            }
        }
        const available = !result.error && result.status === 0
        const summary = firstOutputLine(result.stdout) ?? firstOutputLine(result.stderr)
        return {
            ...definition,
            available,
            summary: available ? summary : undefined,
            error: available ? undefined : describeFailure(result)
        }
    })
}

export function getTexEnvironmentInstallAdvice(platform: NodeJS.Platform = process.platform): string {
    if (platform === 'darwin') {
        return 'Verify that MacTeX/BasicTeX provides latexmk and pdflatex and that /Library/TeX/texbin exists. Install or repair the distribution only if the tools are absent, then reload VS Code.'
    }
    if (platform === 'win32') {
        return 'Verify that TeX Live/MiKTeX provides the required tools and that its binary directory is in the user or system Path. Install or repair the distribution only if the tools are absent, then restart VS Code.'
    }
    return 'Verify that TeX Live provides the required tools and that its binary directory is on PATH. Install or repair the relevant system packages only if the tools are absent, then restart VS Code.'
}

export function getMissingBuildToolsMessage(
    statuses: readonly TexToolStatus[],
    platform: NodeJS.Platform = process.platform
): string {
    const missing = statuses.filter(status => !status.available).map(status => status.command)
    const advice = statuses.some(status => status.purpose === 'container build runtime')
        ? 'Verify that Docker is installed and running and that the configured Docker command is available, then reload VS Code.'
        : getTexEnvironmentInstallAdvice(platform)
    return `Cannot start secure build because required build tools are unavailable: ${missing.join(', ')}. ${advice} Run "LaTeX-Secure-Workspace: Show secure build status" for details.`
}

export function getLatexBuildFailureMessage(output: string): string | undefined {
    const missingResource = output.match(/LaTeX Error:\s*File\s+[`']([^`'\r\n]+\.(?:sty|cls|bst|bbx|cbx|def|cfg))[`']\s+not found/i)
    if (!missingResource) {
        return undefined
    }
    return `Secure build failed because TeX could not find "${missingResource[1]}". Verify that the file exists in the project or install the TeX package that provides it, then rebuild.`
}

function firstOutputLine(output: Buffer | string | null | undefined): string | undefined {
    return output?.toString().split(/\r?\n/).map(line => line.trim()).find(Boolean)
}

function describeFailure(result: TexToolResult): string {
    if (result.error) {
        return result.error.message
    }
    const detail = firstOutputLine(result.stderr) ?? firstOutputLine(result.stdout)
    return detail ? `exit ${result.status}: ${detail}` : `exit ${result.status}`
}
