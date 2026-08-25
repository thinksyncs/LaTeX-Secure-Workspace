import * as vscode from 'vscode'
import os from 'os'
import micromatch from 'micromatch'
import * as path from 'path'
import { lw } from '../lw'
import type { ProcessEnv, RecipeStep, Step } from '../types'
import { getSecureConfigurationValueSync } from '../utils/security'
import {
    getLatexBuildFailureMessage,
    getMissingBuildToolsMessage,
    inspectTexEnvironment,
    getRequiredBuildToolDefinitions,
    type TexToolRunner
} from '../utils/tex-environment'
import { build as buildRecipe, getSecureRecipeEngine } from './recipe'
import { queue } from './queue'

const logger = lw.log('Build')

export {
    autoBuild,
    build,
    isFileExcludedFromBuildOnSave
}

lw.watcher.src.onChange(filePath => autoBuild(filePath.fsPath, 'onFileChange'))
lw.watcher.bib.onChange(filePath => autoBuild(filePath.fsPath, 'onFileChange', true))

/**
 * Ignores configured auto-build requests. Secure builds require an explicit
 * user command so opening or saving workspace content cannot start TeX.
 *
 * @param {string} file - The path of the file that triggered the auto build.
 * @param {'onFileChange' | 'onSave'} type - The type of event that triggered
 * the auto build.
 * @param {boolean} bibChanged - Indicates whether the bibliography file has
 * changed.
 */
function autoBuild(file: string, type: 'onFileChange' | 'onSave', bibChanged: boolean = false) {
    const configuration = vscode.workspace.getConfiguration('latex-workshop', lw.file.toUri(file))
    if (configuration.get('latex.autoBuild.run') as string !== type) {
        return
    }
    void bibChanged
    logger.log(`Auto build request ignored in this secure build (${type}): ${file}`)
}

/**
 * Checks if a file is excluded from the build-on-save process based on
 * the value of the `latex.autoBuild.onSave.files.ignore` configuration.
 *
 * @param filePath - The path of the file to check for exclusion from build-on-save.

 * @returns True if the file is excluded from build-on-save, false otherwise.
 */
function isFileExcludedFromBuildOnSave(filePath: string): boolean {
    const configuration = vscode.workspace.getConfiguration('latex-workshop', lw.file.toUri(filePath))
    const globsToIgnore = configuration.get('latex.autoBuild.onSave.files.ignore') as string[]
    const format = (str: string): string => (os.platform() === 'win32' ? str.replace(/\\/g, '/') : str)
    return micromatch.some(filePath, globsToIgnore, { format })
}

let isBuilding = false
/**
 * Initiates the build process for the LaTeX project. It can build the entire
 * project or a specific root file depending on the parameters.
 *
 * This function checks if the active editor is defined, and if not, logs an
 * error message and returns. It then determines the workspace and configuration
 * based on the provided or inferred root file. If an external build command is
 * configured, it spawns the external build process. If the root file is not
 * defined or the language ID is not defined, it logs an error and returns. If
 * the subfile package is used and the user has not chosen to skip the file
 * selection, it prompts the user to select a subfile. Finally, it logs
 * information about the build and initiates the build process using the
 * appropriate recipe.
 *
 * @param {boolean} skipSelection - Whether to skip the file selection prompt.
 * @param {string | undefined} rootFile - The path of the LaTeX root file.
 * @param {string | undefined} languageId - The language ID of the root file.
 * @param {string | undefined} recipe - The name of the recipe to use for the
 * build.
 */
async function build(skipSelection: boolean = false, rootFile: string | undefined = undefined, languageId: string | undefined = undefined, recipe: string | undefined = undefined): Promise<boolean> {
    const activeEditor = vscode.window.activeTextEditor ?? lw.previousActive
    if (!activeEditor) {
        logger.log('Cannot start to build because the active editor is undefined.')
        void logger.showErrorMessageWithExtensionLogButton('Cannot start secure build because no LaTeX editor is active. Open a LaTeX document and try again.')
        return false
    }

    logger.log(`The document of the active editor: ${activeEditor.document.uri.toString(true)}`)
    logger.log(`The languageId of the document: ${activeEditor.document.languageId}`)
    const workspace = rootFile ? lw.file.toUri(rootFile) : activeEditor.document.uri
    const configuration = vscode.workspace.getConfiguration('latex-workshop', workspace)
    const externalBuildCommand = configuration.get('latex.external.build.command') as string

    const activeLanguageId = activeEditor.document.languageId
    const canResolveProjectRoot = lw.file.hasLaTeXLangId(activeLanguageId)
        || lw.file.hasLaTeXClassPackageLangId(activeLanguageId)
        || lw.file.hasBibLangId(activeLanguageId)
    if (rootFile === undefined && canResolveProjectRoot) {
        rootFile = await lw.root.resolveSecurityRoot()
        languageId = lw.root.file.langId
    }
    if (externalBuildCommand) {
        logger.log('Ignoring external build command in this secure build.')
    }
    if (rootFile === undefined || languageId === undefined) {
        logger.log('Cannot find LaTeX root file. See https://github.com/James-Yu/LaTeX-Workshop/wiki/Compile#the-root-file')
        void logger.showErrorMessageWithExtensionLogButton('Cannot find a LaTeX root file. Open the main TeX document and try again.')
        return false
    }
    void skipSelection

    if (!isBuildEnvironmentReady(lw.file.toUri(rootFile), recipe)) {
        return false
    }

    logger.log(`Building root file: ${rootFile}`)
    return buildRecipe(rootFile, languageId, buildLoop, recipe)
}

function isBuildEnvironmentReady(scope: vscode.ConfigurationScope, recipeName?: string): boolean {
    const dockerEnabled = getSecureConfigurationValueSync(scope, 'docker.enabled', false)
    if (getSecureRecipeEngine(recipeName) === 'lualatex' && !dockerEnabled) {
        logger.log('Secure LuaLaTeX builds require Docker isolation.')
        logger.refreshStatus('x', 'errorForeground', undefined, 'error')
        void logger.showErrorMessageWithExtensionLogButton('Secure LuaLaTeX builds require Docker isolation because LuaLaTeX can execute document-supplied Lua. Enable latex-workshop.docker.enabled and configure latex-workshop.docker.image.latex in user settings.')
        return false
    }
    if (dockerEnabled) {
        const dockerImage = getSecureConfigurationValueSync(scope, 'docker.image.latex', '').trim()
        if (!dockerImage) {
            logger.log('Docker build is enabled, but no LaTeX image is configured.')
            logger.refreshStatus('x', 'errorForeground', undefined, 'error')
            void logger.showErrorMessageWithExtensionLogButton('Docker build is enabled, but no LaTeX image is configured. Set latex-workshop.docker.image.latex in user settings or disable Docker.')
            return false
        }
    }
    const definitions = dockerEnabled
        ? [{
            command: getSecureConfigurationValueSync(scope, 'docker.path', 'docker').trim() || 'docker',
            args: ['--version'],
            purpose: 'container build runtime',
            requiredForBuild: true
        }]
        : getRequiredBuildToolDefinitions(getSecureRecipeEngine(recipeName))
    const statuses = inspectTexEnvironment(lw.external.sync as TexToolRunner, definitions)
    const missing = statuses.filter(status => !status.available)
    if (missing.length === 0) {
        return true
    }
    logger.log(`Required LaTeX tools unavailable: ${missing.map(status => `${status.command}: ${status.error}`).join('; ')}`)
    logger.refreshStatus('x', 'errorForeground', undefined, 'error')
    void logger.showErrorMessageWithExtensionLogButton(getMissingBuildToolsMessage(statuses))
    return false
}

/**
 * Checks if another build loop is already running. If not, it iterates through
 * the queue and executes each Tool one by one.
 *
 * This function first checks if a build is already in progress. If it is, it
 * returns early. Otherwise, it sets the `compiling` flag to true and the
 * `lastBuildTime` to the current timestamp. It then enters a loop where it
 * dequeues steps from the queue. For each step, it spawns the process and
 * monitors the process until completion. After each step, it checks if it's the
 * last step and performs cleanup if necessary. Finally, it sets the `compiling`
 * flag to false.
 */
async function buildLoop(): Promise<boolean> {
    if (isBuilding) {
        logger.log('Another build loop is already running.')
        return false
    }

    // Clear all logs before starting
    lw.parser.parse.clearLog()
    isBuilding = true
    lw.compile.compiledPDFWriting++
    // Stop watching the PDF file to avoid reloading the PDF viewer twice.
    // The builder will be responsible for refreshing the viewer.
    let skipped = true
    let completedBuild = false
    let failed = false
    try {
        while (true) {
            const step = queue.getStep()
            if (step === undefined) {
                break
            }
            const env = spawnProcess(step)
            const success = await monitorProcess(step, env)
            failed = failed || !success
            skipped = skipped && !step.isExternal && step.isSkipped
            if (success && queue.isLastStep(step)) {
                await afterSuccessfulBuilt(step, skipped)
                completedBuild = true
            }
        }
    } catch (error) {
        failed = true
        queue.clear()
        logger.logError('Unexpected error while running secure build.', error)
        logger.refreshStatus('x', 'errorForeground', undefined, 'error')
        const detail = error instanceof Error ? error.message : String(error)
        void logger.showErrorMessageWithExtensionLogButton(`Secure build could not finish: ${detail}`)
    } finally {
        isBuilding = false
        setTimeout(() => {
            lw.compile.compiledPDFWriting = Math.max(0, lw.compile.compiledPDFWriting - 1)
        }, vscode.workspace.getConfiguration('latex-workshop').get('latex.watch.pdf.delay') as number * 2)
    }
    return completedBuild && !failed
}
/** Normalizes a command-line argument that represents a file path to be
 * relative to the current working directory (`cwd`) if it is under the root
 * directory (`rootDir`). If the argument does not represent a path or is not
 * under the root directory, it is returned unchanged.
 *
 * @param {string} arg - The command-line argument to normalize.
 * @param {string} cwd - The current working directory.
 * @param {string} rootDir - The root directory of the LaTeX project.
 * @returns {string} - The normalized command-line argument.
 */
function normalizeArgForCwd(arg: string, cwd: string, rootDir: string): string {
    if (!arg) { return arg }
    let abs: string
    try {
        abs = path.isAbsolute(arg) ? path.normalize(arg) : path.resolve(cwd, arg)
    } catch {
        logger.log(`Cannot resolve path for arg: ${arg} please check if it is a valid path.`)
        return arg
    }
    const relToRoot = path.relative(rootDir, abs)
    const isUnderRoot = relToRoot === '' || (!relToRoot.startsWith('..') && !path.isAbsolute(relToRoot))
    if (!isUnderRoot) {
        logger.log(`Argument path not under root dir, you can wiki how to set openout_any=a if you want to keep as-is: ${arg}`)
        return arg
    }
    const rel = path.relative(cwd, abs).split(path.sep).join('/')
    logger.log(`Argument path converted to relative: ${arg} -> ${rel}`)
    return rel
}


/**
 * Spawns a child process for the specified step. The function creates the
 * environment variables needed for the step and spawns a process according to
 * the nature of the step: a magic command (tex or bib), a recipe tool, or an
 * external command.
 *
 * Based on the type of step, this function sets the current working directory
 * (`cwd`) for the spawn command. If the step is not external, it sets the
 * `cwd` based on the compiled root file,
 * possibly a sub-file. If in such a case, the compile command is `latexmk`, the
 * `cwd` is re-set to the root dir instead of sub-file. If the step is external,
 * it sets the `cwd` based on the provided `cwd` property.
 *
 * @param {Step} step - The Step to be executed.
 * @returns {ProcessEnv} - The process environment passed to the spawned
 * process.
 */
function spawnProcess(step: Step): ProcessEnv {
    const configuration = vscode.workspace.getConfiguration('latex-workshop', step.rootFile ? lw.file.toUri(step.rootFile) : undefined)
    if (step.index === 0 || configuration.get('latex.build.clearLog.everyRecipeStep.enabled') as boolean) {
        logger.clearCompilerMessage()
        logger.showCompilerLog()
    }
    let cwd = step.cwd

    logger.refreshStatus('sync~spin', 'statusBar.foreground', undefined, undefined, ' ' + queue.getStepString(step))
    logger.logCommand(`Recipe step ${step.index + 1}`, step.command, step.args)
    logger.log(`env: ${JSON.stringify(step.env)}`)
    logger.log(`root: ${step.rootFile}`)
    logger.log(`cwd: ${cwd}`)

    const env: ProcessEnv = { ...process.env, ...step.env }
    env['max_print_line'] = lw.constant.MAX_PRINT_LINE

    if (!step.isExternal) {
        if (step.command === 'latexmk' && step.rootFile === lw.root.subfiles.path && lw.root.dir.path && cwd === path.dirname(step.rootFile)) {
            cwd = lw.root.dir.path
        }
        if (step.command === 'bibtex' && step.args && step.args.length > 0) {
            step.args[step.args.length - 1] = normalizeArgForCwd(step.args[step.args.length - 1], cwd, cwd)
        }
        logger.log(`cwd: ${cwd}`)
        lw.compile.process = lw.external.spawn(step.command, step.args ?? [], {cwd, env})
    } else {
        logger.log(`cwd: ${step.cwd}`)
        lw.compile.process = lw.external.spawn(step.command, step.args ?? [], {cwd: step.cwd})
    }
    logger.log(`LaTeX build process spawned with PID ${lw.compile.process.pid}.`)
    return env
}

/**
 * Monitors the output and termination of the tool process. This function
 * monitors the stdout and stderr channels to log and parse the output messages.
 * It also waits for the error or exit signal of the process. If the build is
 * unsuccessful, the function handles different cases and takes appropriate
 * actions.
 *
 * @param {Step} step - The Step of the process whose I/O is monitored.
 * @param {ProcessEnv} env - The process environment passed to the spawned
 * process.
 * @returns {Promise<boolean>} - A promise representing whether the step is
 * successfully executed.
 */
async function monitorProcess(step: Step, env: ProcessEnv): Promise<boolean> {
    if (lw.compile.process === undefined) {
        return false
    }
    let stdout = ''
    lw.compile.process.stdout?.on('data', (msg: Buffer | string) => {
        stdout += msg
        logger.logCompiler(msg.toString())
    })

    let stderr = ''
    lw.compile.process.stderr?.on('data', (msg: Buffer | string) => {
        stderr += msg
        logger.logCompiler(msg.toString())
    })

    const result: boolean = await new Promise(resolve => {
        if (lw.compile.process === undefined) {
            resolve(false)
            return
        }
        lw.compile.process.on('error', err => {
            handleProcessError(step, env, stderr, err)
            resolve(false)
        })

        lw.compile.process.on('exit', (code, signal) => {
            const isSkipped = lw.parser.parse.log(stdout, step.rootFile)
            if (!step.isExternal) {
                step.isSkipped = isSkipped
            }

            if (!step.isExternal && code === 0) {
                logger.log(`Finished a step in recipe with PID ${lw.compile.process?.pid}.`)
                lw.compile.process = undefined
                resolve(true)
                return
            } else if (code === 0) {
                logger.log(`Successfully built document with PID ${lw.compile.process?.pid}.`)
                logger.refreshStatus('check', 'statusBar.foreground', 'Build succeeded.')
                lw.compile.process = undefined
                resolve(true)
                return
            }

            handleExitCodeError(step, env, stdout, stderr, code, signal)
            resolve(false)
        })
    })

    return result
}

/**
 * Handles errors that occur during the execution of a tool process. This
 * function logs the error, refreshes the status, and shows an error message
 * to the user.
 *
 * @param {Step} step - The recipe step that failed to spawn.
 * @param {ProcessEnv} env - The process environment passed to the spawned
 * process.
 * @param {string} stderr - The stderr output of the process.
 * @param {Error} err - The error object representing the error.
 */
function handleProcessError(step: Step, env: ProcessEnv, stderr: string, err: Error) {
    logger.logError(`LaTeX fatal error on PID ${lw.compile.process?.pid}.`, err)
    logger.log(`Does the executable exist? $PATH: ${env['PATH']}, $Path: ${env['Path']}, $SHELL: ${process.env.SHELL}`)
    logger.log(`${stderr}`)
    logger.refreshStatus('x', 'errorForeground', undefined, 'error')
    void logger.showErrorMessageWithExtensionLogButton(getProcessErrorMessage(step.command, err))
    lw.compile.process = undefined
    queue.clear()
}

function getProcessErrorMessage(command: string, err: Error): string {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
        return getMissingBuildToolsMessage([{
            command,
            args: [],
            purpose: 'build command',
            requiredForBuild: true,
            available: false,
            error: err.message
        }])
    }
    return `Recipe terminated with fatal error: ${err.message}.`
}

/**
 * Handles errors that occur when a tool process exits with a non-zero code or
 * signal. The function takes different actions based on the type of error,
 * such as handling retries, cleaning, and showing error messages to the user.
 *
 * @param {Step} step - The Step of the process that exited with an error.
 * @param {ProcessEnv} env - The process environment passed to the spawned
 * process.
 * @param {string} stdout - The stdout output of the process.
 * @param {string} stderr - The stderr output of the process.
 * @param {number | null} code - The exit code of the process.
 * @param {NodeJS.Signals | null} signal - The exit signal of the process.
 */
function handleExitCodeError(step: Step, env: ProcessEnv, stdout: string, stderr: string, code: number | null, signal: NodeJS.Signals | null) {
    if (!step.isExternal) {
        logger.log(`Recipe returns with error code ${code}/${signal} on PID ${lw.compile.process?.pid}.`)
        logger.log(`Does the executable exist? $PATH: ${env['PATH']}, $Path: ${env['Path']}, $SHELL: ${process.env.SHELL}`)
        logger.log(`${stderr}`)
        lw.parser.parse.log(stderr)
    }

    if (!step.isExternal && signal !== 'SIGTERM') {
        handleNoRetryError(step, `${stdout}\n${stderr}`)
    } else if (step.isExternal) {
        handleExternalCommandError()
    } else {
        handleUserTermination()
    }

    lw.compile.process = undefined
}

/**
 * Handles the case where a tool process exits with an error and no retries are
 * allowed. It performs cleanup operations, shows error messages to the user,
 * and clears the BuildToolQueue.
 *
 * @param {RecipeStep} step - The Step representing the tool process.
 * @param {string} output - Combined process output used for targeted guidance.
 */
function handleNoRetryError(_step: RecipeStep, output: string) {
    logger.refreshStatus('x', 'errorForeground')
    void logger.showErrorMessageWithCompilerLogButton(getLatexBuildFailureMessage(output) ?? 'Secure build terminated with error.')
    queue.clear()
}

/**
 * Handles the case where an external command process exits with an error. It
 * shows an error message to the user and clears the BuildToolQueue.
 */
function handleExternalCommandError() {
    logger.log(`Build with external command returns error on PID ${lw.compile.process?.pid}.`)
    logger.refreshStatus('x', 'errorForeground', undefined, 'warning')
    void logger.showErrorMessageWithCompilerLogButton('Build terminated with error.')
    queue.clear()
}

/**
 * Handles the case where a tool process is terminated by the user. It refreshes
 * the status and clears the BuildToolQueue.
 */
function handleUserTermination() {
    logger.refreshStatus('x', 'errorForeground')
    queue.clear()
}

/**
 * Performs follow-up operations after successfully finishing a recipe. This
 * includes refreshing the PDF viewer, cleaning files, and handling SyncTeX if
 * configured.
 *
 * @param {Step} lastStep - The last Step in the recipe.
 * @param {boolean} skipped - Whether the whole building process is skipped by
 * latexmk.
 */
async function afterSuccessfulBuilt(lastStep: Step, skipped: boolean) {
    if (lastStep.rootFile === undefined) {
        return
    }
    const pdfPath = lw.file.getSecurityPdfPath(lastStep.rootFile)
    const pdfUri = vscode.Uri.file(pdfPath)
    logger.log(`Successfully built ${lastStep.rootFile} .`)
    logger.refreshStatus('check', 'statusBar.foreground', 'Recipe succeeded.')
    lw.event.fire(lw.event.BuildDone)
    if (await lw.file.exists(pdfPath)) {
        if (lw.viewer.isViewing(pdfUri)) {
            if (!skipped) {
                lw.viewer.refresh(pdfUri)
            }
        } else {
            await lw.viewer.view(pdfUri, 'tab')
        }
    }
    lw.completion.reference.setNumbersFromAuxFile(lastStep.rootFile)
    await lw.cache.loadFlsFile(lastStep.rootFile ?? '')
}
