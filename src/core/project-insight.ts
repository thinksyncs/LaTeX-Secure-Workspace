import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as vscode from 'vscode'

import { getAvailableRecipes } from '../compile/recipe'
import { lw } from '../lw'
import {
    buildImageResolution,
    collectGraphicspathDirs,
    collectIncludeGraphics
} from '../lint/graphics-diagnostics-utils'
import { stripCommentsAndVerbatim } from '../utils/utils'

type SourceLocation = {
    filePath: string,
    value: string
}

type DependencyEdge = {
    from: string,
    to: string
}

type MissingDependency = {
    from: string,
    value: string
}

export type EngineRecommendation = {
    engine: 'pdflatex' | 'lualatex',
    signals: string[]
}

export type ProjectInspection = {
    activeFile?: string,
    bibliographyFiles: string[],
    bibliographyKeys: Set<string>,
    citations: SourceLocation[],
    duplicateLabels: SourceLocation[],
    edges: DependencyEdge[],
    engine: EngineRecommendation,
    files: string[],
    labels: SourceLocation[],
    missingCitations: SourceLocation[],
    missingGraphics: MissingDependency[],
    missingInputs: MissingDependency[],
    missingReferences: SourceLocation[],
    parentCandidates: string[],
    references: SourceLocation[],
    rootFile: string,
    unusedLabels: SourceLocation[],
    workspacePath: string
}

type BuildProvenance = {
    activeSource?: string,
    completedAt: number,
    durationMs: number,
    pdfBytes?: number,
    pdfPath: string,
    pdfSha256?: string,
    recipe: string,
    recipeCommand: string,
    rootFile: string,
    startedAt: number
}

type RecordBuildArgs = {
    activeSource?: string,
    pdfPath: string,
    recipeName?: string,
    rootFile: string,
    startedAt: number
}

const ROOT_INDICATOR = /\\documentclass(?:\s*\[[^\]]*\])?\s*\{[^}]+}|\\begin\s*\{document}|\\starttext|\\startTEXpage/ms
const SIMPLE_INPUT = /\\(?:input|include|subfile|subfileinclude|markdownInput|loadglsentries)\*?(?:\[[^[\]{}]*\])?\s*\{([^}]+)\}/g
const IMPORT_INPUT = /\\(?:sub)?(?:import|inputfrom|includefrom)\*?\s*\{([^}]+)\}\s*\{([^}]+)\}/g
const BIBLIOGRAPHY = /\\bibliography\s*\{([^}]+)\}|\\addbibresource(?:\[[^\]]*\])?\s*\{([^}]+)\}/g
const LABEL = /\\label\s*\{([^}]+)\}/g
const REFERENCE = /\\(?:ref|eqref|autoref|pageref|cref|Cref|vref|Vref)\s*\{([^}]+)\}/g
const CITATION = /\\(?:[A-Za-z]*cite[A-Za-z]*|nocite)(?:\[[^\]]*\])*\s*\{([^}]+)\}/g
const BIB_ENTRY = /@\w+\s*\{\s*([^,\s]+)\s*,/g
const BIB_ITEM = /\\bibitem(?:\[[^\]]*\])?\s*\{([^}]+)\}/g

let latestBuild: BuildProvenance | undefined

export async function showBuildRootInspector(): Promise<void> {
    const inspection = await inspectProject()
    if (!inspection) {
        void vscode.window.showWarningMessage('No LaTeX project root is available.')
        return
    }
    await showMarkdown(renderRootInspector(inspection))
}

export async function showProjectHealth(): Promise<void> {
    const inspection = await inspectProject()
    if (!inspection) {
        void vscode.window.showWarningMessage('No LaTeX project root is available.')
        return
    }
    await showMarkdown(renderProjectHealth(inspection))
}

export async function showBuildProvenance(): Promise<void> {
    if (!latestBuild) {
        await showMarkdown([
            '# Secure Build Provenance',
            '',
            'No manual build has completed in this extension session.',
            ''
        ].join('\n'))
        return
    }
    await showMarkdown(renderBuildProvenance(latestBuild))
}

export async function inspectProject(rootFile?: string, activeFile?: string): Promise<ProjectInspection | undefined> {
    rootFile = rootFile ?? lw.root.file.path ?? await lw.root.resolveSecurityRoot()
    if (!rootFile) {
        return
    }
    const workspace = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(rootFile))
    if (!workspace || workspace.uri.scheme !== 'file') {
        return
    }
    activeFile = activeFile ?? getActiveSourceFile()
    const workspacePath = await realpathOrResolve(workspace.uri.fsPath)
    const graph = await collectProjectGraph(rootFile, workspacePath)
    const parentCandidates = activeFile
        ? await collectParentCandidates(activeFile, workspace, workspacePath)
        : [rootFile]
    const bibliographyKeys = await collectBibliographyKeys(graph.bibliographyFiles)
    for (const file of graph.files) {
        const content = await readProjectFile(file)
        if (content === undefined) {
            continue
        }
        collectMatches(content, BIB_ITEM).forEach(value => bibliographyKeys.add(value))
    }

    const labelCounts = new Map<string, SourceLocation[]>()
    for (const label of graph.labels) {
        const locations = labelCounts.get(label.value) ?? []
        locations.push(label)
        labelCounts.set(label.value, locations)
    }
    const duplicateLabels = [...labelCounts.values()].filter(locations => locations.length > 1).flat()
    const labelKeys = new Set(labelCounts.keys())
    const referencedKeys = new Set(graph.references.map(reference => reference.value))
    const missingReferences = uniqueLocations(graph.references.filter(reference => !labelKeys.has(reference.value)))
    const unusedLabels = uniqueLocations(graph.labels.filter(label => !referencedKeys.has(label.value)))
    const missingCitations = uniqueLocations(graph.citations.filter(citation => citation.value !== '*' && !bibliographyKeys.has(citation.value)))

    return {
        activeFile,
        bibliographyFiles: graph.bibliographyFiles,
        bibliographyKeys,
        citations: graph.citations,
        duplicateLabels,
        edges: graph.edges,
        engine: detectEngine(graph.contents),
        files: graph.files,
        labels: graph.labels,
        missingCitations,
        missingGraphics: graph.missingGraphics,
        missingInputs: graph.missingInputs,
        missingReferences,
        parentCandidates,
        references: graph.references,
        rootFile,
        unusedLabels,
        workspacePath
    }
}

export async function getEngineRecommendation(rootFile?: string): Promise<EngineRecommendation | undefined> {
    const inspection = await inspectProject(rootFile, '')
    return inspection?.engine
}

export async function getBuildRootCandidates(): Promise<string[]> {
    const inspection = await inspectProject()
    return inspection?.parentCandidates ?? []
}

export async function getProjectFilePaths(rootFile?: string): Promise<string[]> {
    const inspection = await inspectProject(rootFile, '')
    return inspection?.files ?? []
}

export async function recordBuildProvenance(args: RecordBuildArgs): Promise<void> {
    const completedAt = Date.now()
    const workspace = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(args.rootFile))
    const recipes = await getAvailableRecipes(workspace)
    const recipe = recipes.find(candidate => candidate.name === args.recipeName) ?? recipes[0]
    let pdfBytes: number | undefined
    let pdfSha256: string | undefined
    try {
        const fingerprint = await fingerprintFile(args.pdfPath)
        pdfBytes = fingerprint.bytes
        pdfSha256 = fingerprint.sha256
    } catch {
    }
    latestBuild = {
        activeSource: args.activeSource,
        completedAt,
        durationMs: Math.max(0, completedAt - args.startedAt),
        pdfBytes,
        pdfPath: args.pdfPath,
        pdfSha256,
        recipe: recipe?.name ?? args.recipeName ?? '(unknown)',
        recipeCommand: formatRecipe(recipe),
        rootFile: args.rootFile,
        startedAt: args.startedAt
    }
}

async function fingerprintFile(filePath: string): Promise<{ bytes: number, sha256: string }> {
    const stat = await fs.promises.stat(filePath)
    const hash = crypto.createHash('sha256')
    for await (const chunk of fs.createReadStream(filePath)) {
        hash.update(chunk as Buffer)
    }
    return {
        bytes: stat.size,
        sha256: hash.digest('hex')
    }
}

async function collectProjectGraph(rootFile: string, workspacePath: string): Promise<{
    bibliographyFiles: string[],
    citations: SourceLocation[],
    contents: string[],
    edges: DependencyEdge[],
    files: string[],
    labels: SourceLocation[],
    missingGraphics: MissingDependency[],
    missingInputs: MissingDependency[],
    references: SourceLocation[]
}> {
    const files: string[] = []
    const bibliographyFiles = new Set<string>()
    const citations: SourceLocation[] = []
    const contents: string[] = []
    const edges: DependencyEdge[] = []
    const labels: SourceLocation[] = []
    const missingGraphics: MissingDependency[] = []
    const missingInputs: MissingDependency[] = []
    const references: SourceLocation[] = []
    const queue = [path.resolve(rootFile)]
    const visited = new Set<string>()

    while (queue.length > 0) {
        const filePath = queue.shift()!
        const normalized = normalizePath(filePath)
        if (visited.has(normalized) || !await isProjectPath(filePath, workspacePath)) {
            continue
        }
        visited.add(normalized)
        const rawContent = await readProjectFile(filePath)
        if (rawContent === undefined) {
            continue
        }
        const content = stripCommentsAndVerbatim(rawContent)
        files.push(filePath)
        contents.push(content)

        for (const input of parseInputs(content)) {
            const resolved = await resolveInput(input.value, input.directory, filePath, rootFile, workspacePath)
            if (!resolved) {
                if (isStaticPath(input.value)) {
                    missingInputs.push({ from: filePath, value: input.display })
                }
                continue
            }
            edges.push({ from: filePath, to: resolved })
            if (!visited.has(normalizePath(resolved))) {
                queue.push(resolved)
            }
        }

        const rootDir = path.dirname(rootFile)
        const documentDir = path.dirname(filePath)
        const graphicsDirs = collectGraphicspathDirs(content)
        for (const graphic of collectIncludeGraphics(content)) {
            const resolution = buildImageResolution(graphic.imagePath, documentDir, rootDir, graphicsDirs)
            if (!await firstExistingProjectPath(resolution.candidates, workspacePath)) {
                missingGraphics.push({ from: filePath, value: graphic.imagePath })
            }
        }

        for (const bibliography of parseBibliographies(content)) {
            const resolved = await resolveBibliography(bibliography, filePath, rootFile, workspacePath)
            if (resolved) {
                bibliographyFiles.add(resolved)
            }
        }

        collectMatches(content, LABEL).forEach(value => labels.push({ filePath, value }))
        collectListMatches(content, REFERENCE).forEach(value => references.push({ filePath, value }))
        collectListMatches(content, CITATION).forEach(value => citations.push({ filePath, value }))
    }

    return {
        bibliographyFiles: [...bibliographyFiles],
        citations,
        contents,
        edges,
        files,
        labels,
        missingGraphics,
        missingInputs,
        references
    }
}

async function collectParentCandidates(activeFile: string, workspace: vscode.WorkspaceFolder, workspacePath: string): Promise<string[]> {
    if (!await isProjectPath(activeFile, workspacePath)) {
        return []
    }
    const candidates: string[] = []
    const uris = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspace, '**/*.{tex,ltx,rnw,Rnw}'),
        '**/{.git,node_modules,.lw-security}/**',
        2000
    )
    for (const uri of uris) {
        const content = await readProjectFile(uri.fsPath)
        if (content === undefined || !ROOT_INDICATOR.test(stripCommentsAndVerbatim(content))) {
            continue
        }
        if (normalizePath(uri.fsPath) === normalizePath(activeFile)
            || await lw.root.components.includesProjectFile(uri.fsPath, activeFile, workspacePath)) {
            candidates.push(uri.fsPath)
        }
    }
    return candidates.sort((left, right) => left.localeCompare(right))
}

function parseInputs(content: string): { value: string, directory?: string, display: string }[] {
    const inputs: { value: string, directory?: string, display: string }[] = []
    content = stripCommentsAndVerbatim(content)
    SIMPLE_INPUT.lastIndex = 0
    IMPORT_INPUT.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = SIMPLE_INPUT.exec(content)) !== null) {
        const value = match[1]?.trim()
        if (value) {
            inputs.push({ value, display: value })
        }
    }
    while ((match = IMPORT_INPUT.exec(content)) !== null) {
        const directory = match[1]?.trim()
        const value = match[2]?.trim()
        if (value) {
            inputs.push({ value, directory, display: directory ? path.join(directory, value) : value })
        }
    }
    return inputs
}

function parseBibliographies(content: string): string[] {
    const result: string[] = []
    BIBLIOGRAPHY.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = BIBLIOGRAPHY.exec(content)) !== null) {
        const raw = (match[1] ?? match[2] ?? '').trim()
        raw.split(',').map(value => value.trim()).filter(Boolean).forEach(value => result.push(value))
    }
    return result
}

async function resolveInput(value: string, directory: string | undefined, currentFile: string, rootFile: string, workspacePath: string): Promise<string | undefined> {
    if (!isStaticPath(value) || (directory && !isStaticPath(directory))) {
        return
    }
    const relativeValue = stripQuotes(value)
    const relativeDirectory = stripQuotes(directory ?? '')
    const baseDirs = directory
        ? [path.resolve(path.dirname(currentFile), relativeDirectory), path.resolve(path.dirname(rootFile), relativeDirectory)]
        : [path.dirname(currentFile), path.dirname(rootFile)]
    const candidates = baseDirs.flatMap(baseDir => {
        const candidate = path.resolve(baseDir, relativeValue)
        return path.extname(candidate) ? [candidate] : [candidate, `${candidate}.tex`]
    })
    return firstExistingProjectPath(candidates, workspacePath)
}

async function resolveBibliography(value: string, currentFile: string, rootFile: string, workspacePath: string): Promise<string | undefined> {
    if (!isStaticPath(value)) {
        return
    }
    const relativeValue = stripQuotes(value)
    const withExtension = path.extname(relativeValue) ? relativeValue : `${relativeValue}.bib`
    return firstExistingProjectPath([
        path.resolve(path.dirname(currentFile), withExtension),
        path.resolve(path.dirname(rootFile), withExtension)
    ], workspacePath)
}

async function firstExistingProjectPath(candidates: string[], workspacePath: string): Promise<string | undefined> {
    for (const candidate of [...new Set(candidates.map(value => path.resolve(value)))]) {
        if (!await isProjectPath(candidate, workspacePath)) {
            continue
        }
        try {
            const stat = await fs.promises.stat(candidate)
            if (stat.isFile()) {
                return candidate
            }
        } catch {
        }
    }
    return
}

async function collectBibliographyKeys(files: string[]): Promise<Set<string>> {
    const keys = new Set<string>()
    for (const file of files) {
        const content = await readProjectFile(file)
        if (content === undefined) {
            continue
        }
        collectMatches(content, BIB_ENTRY).forEach(value => keys.add(value))
    }
    return keys
}

function collectMatches(content: string, expression: RegExp): string[] {
    const values: string[] = []
    expression.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = expression.exec(content)) !== null) {
        const value = match[1]?.trim()
        if (value) {
            values.push(value)
        }
    }
    return values
}

function collectListMatches(content: string, expression: RegExp): string[] {
    return collectMatches(content, expression)
        .flatMap(value => value.split(','))
        .map(value => value.trim())
        .filter(Boolean)
}

function detectEngine(contents: string[]): EngineRecommendation {
    const joined = contents.join('\n')
    const checks: [RegExp, string][] = [
        [/\\usepackage(?:\[[^\]]*\])?\s*\{[^}]*fontspec[^}]*\}/, 'fontspec package'],
        [/\\usepackage(?:\[[^\]]*\])?\s*\{[^}]*unicode-math[^}]*\}/, 'unicode-math package'],
        [/\\directlua\b/, '\\directlua'],
        [/\\begin\s*\{luacode\*?\}/, 'luacode environment'],
        [/\\setmainfont\b|\\setsansfont\b|\\setmonofont\b/, 'system font command']
    ]
    const signals = checks.filter(([expression]) => expression.test(joined)).map(([, label]) => label)
    return {
        engine: signals.length > 0 ? 'lualatex' : 'pdflatex',
        signals
    }
}

function renderRootInspector(inspection: ProjectInspection): string {
    const pathName = (value: string) => relativeDisplayPath(value, inspection.workspacePath)
    const chain = findDependencyChain(inspection.rootFile, inspection.activeFile, inspection.edges)
    const reason = inspection.activeFile && normalizePath(inspection.activeFile) !== normalizePath(inspection.rootFile)
        ? chain.length > 0 ? 'The selected root reaches the active file through project-local input/include edges.' : 'The fixed root resolver selected the best project root candidate.'
        : 'The active file is the selected standalone root.'
    return [
        '# Build Root Inspector',
        '',
        `- Active source: \`${inspection.activeFile ? pathName(inspection.activeFile) : '(none)'}\``,
        `- Selected root: \`${pathName(inspection.rootFile)}\``,
        `- Selection reason: ${reason}`,
        `- Parent candidates: ${inspection.parentCandidates.length}`,
        '',
        '## Parent Candidates',
        '',
        ...formatList(inspection.parentCandidates.map(candidate => `\`${pathName(candidate)}\`${normalizePath(candidate) === normalizePath(inspection.rootFile) ? ' (selected)' : ''}`)),
        '',
        '## Active Source Chain',
        '',
        ...formatList(chain.length > 0 ? [chain.map(pathName).map(value => `\`${value}\``).join(' -> ')] : []),
        '',
        '## Project Dependencies',
        '',
        ...renderDependencyTree(inspection.rootFile, inspection.edges, pathName),
        '',
        `Files: ${inspection.files.length}; dependency edges: ${inspection.edges.length}`,
        ''
    ].join('\n')
}

function renderProjectHealth(inspection: ProjectInspection): string {
    const pathName = (value: string) => relativeDisplayPath(value, inspection.workspacePath)
    const finding = (item: SourceLocation | MissingDependency) => `\`${pathName('filePath' in item ? item.filePath : item.from)}\`: \`${item.value}\``
    return [
        '# LaTeX Project Health',
        '',
        `- Root: \`${pathName(inspection.rootFile)}\``,
        `- Files scanned: ${inspection.files.length}`,
        `- Recommended engine: **${inspection.engine.engine === 'lualatex' ? 'LuaLaTeX' : 'pdfLaTeX'}**`,
        `- Engine signals: ${inspection.engine.signals.length > 0 ? inspection.engine.signals.join(', ') : 'none'}`,
        '',
        '## Missing Inputs',
        '',
        ...formatList(inspection.missingInputs.map(finding)),
        '',
        '## Missing Graphics',
        '',
        ...formatList(inspection.missingGraphics.map(finding)),
        '',
        '## Missing Citations',
        '',
        ...formatList(inspection.missingCitations.map(finding)),
        '',
        '## Missing References',
        '',
        ...formatList(inspection.missingReferences.map(finding)),
        '',
        '## Duplicate Labels',
        '',
        ...formatList(inspection.duplicateLabels.map(finding)),
        '',
        '## Unused Labels',
        '',
        ...formatList(inspection.unusedLabels.map(finding)),
        '',
        'This command only reads project-local files. It does not run TeX, invoke external tools, or access the network.',
        ''
    ].join('\n')
}

function renderBuildProvenance(record: BuildProvenance): string {
    return [
        '# Secure Build Provenance',
        '',
        `- Started: ${new Date(record.startedAt).toISOString()}`,
        `- Completed: ${new Date(record.completedAt).toISOString()}`,
        `- Duration: ${record.durationMs} ms`,
        `- Active source: \`${redactHome(record.activeSource ?? '(none)')}\``,
        `- Root file: \`${redactHome(record.rootFile)}\``,
        `- Recipe: \`${record.recipe}\``,
        `- Fixed command: \`${record.recipeCommand}\``,
        `- PDF: \`${redactHome(record.pdfPath)}\``,
        `- PDF bytes: ${record.pdfBytes ?? '(unavailable)'}`,
        `- PDF SHA-256: \`${record.pdfSha256 ?? '(unavailable)'}\``,
        '',
        'Home-directory prefixes are redacted in this report.',
        ''
    ].join('\n')
}

function renderDependencyTree(rootFile: string, edges: DependencyEdge[], display: (value: string) => string): string[] {
    const children = new Map<string, string[]>()
    for (const edge of edges) {
        const values = children.get(normalizePath(edge.from)) ?? []
        values.push(edge.to)
        children.set(normalizePath(edge.from), values)
    }
    const lines: string[] = []
    const visit = (file: string, depth: number, ancestry: Set<string>) => {
        lines.push(`${'  '.repeat(depth)}- \`${display(file)}\``)
        const key = normalizePath(file)
        if (ancestry.has(key)) {
            lines[lines.length - 1] += ' (cycle)'
            return
        }
        const nextAncestry = new Set(ancestry)
        nextAncestry.add(key)
        for (const child of children.get(key) ?? []) {
            visit(child, depth + 1, nextAncestry)
        }
    }
    visit(rootFile, 0, new Set())
    return lines
}

function findDependencyChain(rootFile: string, activeFile: string | undefined, edges: DependencyEdge[]): string[] {
    if (!activeFile) {
        return []
    }
    const target = normalizePath(activeFile)
    const queue: string[][] = [[rootFile]]
    const visited = new Set<string>()
    while (queue.length > 0) {
        const chain = queue.shift()!
        const current = chain[chain.length - 1]
        const key = normalizePath(current)
        if (key === target) {
            return chain
        }
        if (visited.has(key)) {
            continue
        }
        visited.add(key)
        for (const edge of edges.filter(candidate => normalizePath(candidate.from) === key)) {
            queue.push([...chain, edge.to])
        }
    }
    return []
}

function uniqueLocations(locations: SourceLocation[]): SourceLocation[] {
    const seen = new Set<string>()
    return locations.filter(location => {
        const key = `${normalizePath(location.filePath)}\0${location.value}`
        if (seen.has(key)) {
            return false
        }
        seen.add(key)
        return true
    })
}

function formatRecipe(recipe: Awaited<ReturnType<typeof getAvailableRecipes>>[number] | undefined): string {
    if (!recipe) {
        return '(none)'
    }
    return recipe.tools.map(tool => typeof tool === 'string'
        ? tool
        : [tool.command, ...(tool.args ?? [])].join(' ')
    ).join(' -> ')
}

function formatList(values: string[]): string[] {
    return values.length > 0 ? values.map(value => `- ${value}`) : ['- None.']
}

async function showMarkdown(content: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument({ content, language: 'markdown' })
    await vscode.window.showTextDocument(document, { preview: false })
}

function getActiveSourceFile(): string | undefined {
    const editor = vscode.window.activeTextEditor ?? lw.previousActive
    return editor && lw.file.hasLaTeXLangId(editor.document.languageId) ? editor.document.fileName : undefined
}

async function readProjectFile(filePath: string): Promise<string | undefined> {
    const normalized = normalizePath(filePath)
    const openDocument = vscode.workspace.textDocuments.find(document => normalizePath(document.fileName) === normalized)
    if (openDocument) {
        return openDocument.getText()
    }
    try {
        return await fs.promises.readFile(filePath, 'utf8')
    } catch {
        return
    }
}

async function isProjectPath(filePath: string, workspacePath: string): Promise<boolean> {
    try {
        const candidate = await fs.promises.realpath(filePath)
        const relative = path.relative(workspacePath, candidate)
        return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
    } catch {
        const relative = path.relative(workspacePath, path.resolve(filePath))
        return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`))
    }
}

async function realpathOrResolve(filePath: string): Promise<string> {
    try {
        return await fs.promises.realpath(filePath)
    } catch {
        return path.resolve(filePath)
    }
}

function isStaticPath(value: string): boolean {
    return value.length > 0 && !value.includes('\\') && !value.includes('{') && !value.includes('}')
}

function stripQuotes(value: string): string {
    return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value
}

function normalizePath(filePath: string): string {
    const normalized = path.resolve(filePath)
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function relativeDisplayPath(filePath: string, workspacePath: string): string {
    const relative = path.relative(workspacePath, filePath)
    return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) ? relative : redactHome(filePath)
}

function redactHome(filePath: string): string {
    const home = os.homedir()
    return filePath === home || filePath.startsWith(`${home}${path.sep}`)
        ? `~${filePath.slice(home.length)}`
        : filePath
}

export const projectInsightComponents = {
    collectListMatches,
    collectMatches,
    detectEngine,
    fingerprintFile,
    findDependencyChain,
    parseBibliographies,
    parseInputs,
    renderDependencyTree
}
