import {
    getLatexBuildFailureMessage,
    getMissingBuildToolsMessage,
    getRequiredBuildToolDefinitions,
    getTexEnvironmentInstallAdvice,
    inspectTexEnvironment,
    REQUIRED_BUILD_TOOL_DEFINITIONS,
    type TexToolRunner
} from '../../src/utils/tex-environment'
import { assert } from './utils'

describe('34_utils_tex_environment:', () => {
    it('should report available tools and the first version line', () => {
        const runner: TexToolRunner = (_command, _args, options) => {
            assert.deepStrictEqual(options, {
                encoding: 'utf8',
                timeout: 5000,
                windowsHide: true
            })
            return {
                error: null,
                status: 0,
                stdout: '\nLatexmk version 4.88\nmore detail',
                stderr: ''
            }
        }

        const statuses = inspectTexEnvironment(runner, REQUIRED_BUILD_TOOL_DEFINITIONS.slice(0, 1))

        assert.strictEqual(statuses[0].available, true)
        assert.strictEqual(statuses[0].summary, 'Latexmk version 4.88')
        assert.strictEqual(statuses[0].error, undefined)
    })

    it('should report ENOENT without throwing', () => {
        const error = Object.assign(new Error('spawn latexmk ENOENT'), { code: 'ENOENT' })
        const statuses = inspectTexEnvironment(() => ({
            error,
            status: null,
            stdout: '',
            stderr: ''
        }), REQUIRED_BUILD_TOOL_DEFINITIONS.slice(0, 1))

        assert.strictEqual(statuses[0].available, false)
        assert.strictEqual(statuses[0].error, 'spawn latexmk ENOENT')
    })

    it('should report a non-zero tool probe with its stderr', () => {
        const statuses = inspectTexEnvironment(() => ({
            status: 1,
            stdout: '',
            stderr: 'installation is incomplete'
        }), REQUIRED_BUILD_TOOL_DEFINITIONS.slice(0, 1))

        assert.strictEqual(statuses[0].available, false)
        assert.strictEqual(statuses[0].error, 'exit 1: installation is incomplete')
    })

    it('should report a thrown probe error without propagating it', () => {
        const statuses = inspectTexEnvironment(() => {
            throw new Error('probe crashed')
        }, REQUIRED_BUILD_TOOL_DEFINITIONS.slice(0, 1))

        assert.strictEqual(statuses[0].available, false)
        assert.strictEqual(statuses[0].error, 'probe crashed')
    })

    it('should provide platform-specific installation guidance', () => {
        assert.match(getTexEnvironmentInstallAdvice('darwin'), /MacTeX\/BasicTeX/)
        assert.match(getTexEnvironmentInstallAdvice('win32'), /TeX Live\/MiKTeX/)
        assert.match(getTexEnvironmentInstallAdvice('linux'), /system packages/)
    })

    it('should require the selected engine for secure builds', () => {
        assert.deepStrictEqual(
            getRequiredBuildToolDefinitions('pdflatex').map(tool => tool.command),
            ['latexmk', 'pdflatex']
        )
        assert.deepStrictEqual(
            getRequiredBuildToolDefinitions('lualatex').map(tool => tool.command),
            ['latexmk', 'lualatex']
        )
    })

    it('should name only unavailable required tools in the build message', () => {
        const statuses = [
            {
                ...REQUIRED_BUILD_TOOL_DEFINITIONS[0],
                available: false,
                error: 'missing'
            },
            {
                ...REQUIRED_BUILD_TOOL_DEFINITIONS[1],
                available: true,
                summary: 'pdfTeX'
            }
        ]

        const message = getMissingBuildToolsMessage(statuses, 'darwin')

        assert.match(message, /unavailable: latexmk\./)
        assert.match(message, /Show secure build status/)
    })

    it('should provide Docker guidance for a missing container runtime', () => {
        const message = getMissingBuildToolsMessage([{
            command: 'docker',
            args: ['--version'],
            purpose: 'container build runtime',
            requiredForBuild: true,
            available: false,
            error: 'missing'
        }], 'linux')

        assert.match(message, /Verify that Docker is installed and running/)
        assert.doesNotMatch(message, /Install or repair TeX Live/)
    })

    it('should turn a missing TeX package into actionable guidance', () => {
        const message = getLatexBuildFailureMessage("! LaTeX Error: File `adjustbox.sty' not found.")

        assert.strictEqual(message, 'Secure build failed because TeX could not find "adjustbox.sty". Verify that the file exists in the project or install the TeX package that provides it, then rebuild.')
        assert.strictEqual(getLatexBuildFailureMessage("! Package pdftex.def Error: File `figure.png' not found."), undefined)
    })
})
