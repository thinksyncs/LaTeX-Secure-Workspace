import * as path from 'path'
import * as vscode from 'vscode'
import { getAvailableRecipes } from '../compile/recipe'
import { lw } from '../lw'

type ReportKind = 'status' | 'mode'

const restrictedConfigurations = [
    'latex.autoBuild.run',
    'latex.recipes',
    'latex.recipe.default',
    'latex.tools',
    'latex.external.build.command',
    'latex.external.build.args',
    'latex.build.enableMagicComments',
    'latex.build.fromWorkspaceFolder',
    'latex.outDir',
    'latex.auxDir',
    'latex.clean.command',
    'latex.clean.args',
    'docker.enabled',
    'docker.image.latex',
    'docker.path',
    'view.pdf.external.viewer.command',
    'view.pdf.external.viewer.args',
    'view.pdf.external.synctex.command',
    'view.pdf.external.synctex.args',
    'kpsewhich.path',
    'synctex.path',
    'linting.chktex.exec.path',
    'linting.lacheck.exec.path',
    'formatting.latexindent.path',
    'formatting.tex-fmt.path'
]

export async function showSecureBuildStatus(): Promise<void> {
    await showReport('status')
}

export async function showSecureModeReport(): Promise<void> {
    await showReport('mode')
}

async function showReport(kind: ReportKind): Promise<void> {
    const markdown = await renderReport(kind)
    const document = await vscode.workspace.openTextDocument({
        content: markdown,
        language: 'markdown'
    })
    await vscode.window.showTextDocument(document, { preview: false })
}

async function renderReport(kind: ReportKind): Promise<string> {
    const rootFile = await resolveCurrentRoot()
    const workspaceScope = rootFile ? vscode.workspace.getWorkspaceFolder(lw.file.toUri(rootFile)) : lw.root.getWorkspace()
    const recipes = await getAvailableRecipes(workspaceScope)
    const recipe = recipes[0]
    const pdfPath = rootFile ? lw.file.getSecurityPdfPath(rootFile) : lw.compile.compiledPDFPath
    const auxDir = rootFile ? resolveAgainstRoot(rootFile, lw.file.getSecurityAuxDir(rootFile)) : undefined
    const outDir = rootFile ? resolveAgainstRoot(rootFile, lw.file.getSecurityOutDir(rootFile)) : undefined
    const ignoredSettings = collectOverriddenRestrictedSettings(rootFile ? lw.file.toUri(rootFile) : undefined)
    const title = kind === 'status' ? 'Secure Build Status' : 'Secure Mode Report'
    const lines = [
        `# ${title}`,
        '',
        `- Workspace trusted: ${vscode.workspace.isTrusted ? 'yes' : 'no'}`,
        `- Virtual workspace: ${isVirtualWorkspace() ? 'yes' : 'no'}`,
        `- Workspace folder: ${formatWorkspaceScope(workspaceScope)}`,
        `- Root file: ${rootFile ?? '(not resolved)'}`,
        `- Output PDF: ${pdfPath ?? '(not resolved)'}`,
        `- Output directory: ${outDir ?? '(not resolved)'}`,
        `- Auxiliary directory: ${auxDir ?? '(not resolved)'}`,
        `- Build profile: ${recipe?.name ?? '(none)'}`,
        `- Build command: ${formatRecipe(recipe)}`,
        ''
    ]

    if (kind === 'mode') {
        lines.push(
            '## Secure Execution Policy',
            '',
            '- Manual build and clean require a trusted, non-virtual workspace.',
            '- Secure builds use the fixed internal latexmk profile.',
            '- Workspace-controlled recipes, tools, magic comments, output paths, and external viewer commands are ignored in secure execution paths.',
            '- PDF preview uses the local VS Code tab viewer.',
            '- External command paths can require explicit confirmation when they come from workspace-scoped settings.',
            '',
            '## Restricted Settings',
            '',
            ...restrictedConfigurations.map(section => `- latex-workshop.${section}`),
            ''
        )
    }

    if (ignoredSettings.length > 0) {
        lines.push(
            '## Workspace Overrides Ignored In Secure Mode',
            '',
            ...ignoredSettings.map(section => `- latex-workshop.${section}`),
            ''
        )
    } else {
        lines.push(
            '## Workspace Overrides Ignored In Secure Mode',
            '',
            '- None detected in workspace settings.',
            ''
        )
    }

    return `${lines.join('\n')}\n`
}

async function resolveCurrentRoot(): Promise<string | undefined> {
    if (lw.root.file.path) {
        return lw.root.file.path
    }
    return lw.root.resolveSecurityRoot()
}

function resolveAgainstRoot(rootFile: string, target: string): string {
    return path.isAbsolute(target) ? target : path.resolve(path.dirname(rootFile), target)
}

function formatRecipe(recipe: Awaited<ReturnType<typeof getAvailableRecipes>>[number] | undefined): string {
    if (!recipe) {
        return '(none)'
    }
    return recipe.tools.map(tool => {
        if (typeof tool === 'string') {
            return tool
        }
        return [tool.command, ...(tool.args ?? [])].join(' ')
    }).join(' -> ')
}

function isVirtualWorkspace(): boolean {
    return Boolean(vscode.workspace.workspaceFolders?.some(folder => folder.uri.scheme !== 'file'))
}

function formatWorkspaceScope(scope: vscode.WorkspaceFolder | vscode.Uri | undefined): string {
    if (!scope) {
        return '(none)'
    }
    return scope instanceof vscode.Uri ? scope.fsPath : scope.uri.fsPath
}

function collectOverriddenRestrictedSettings(scope: vscode.ConfigurationScope | undefined): string[] {
    const configuration = vscode.workspace.getConfiguration('latex-workshop', scope)
    return restrictedConfigurations.filter(section => {
        const inspected = configuration.inspect(section)
        return inspected?.workspaceValue !== undefined || inspected?.workspaceFolderValue !== undefined
    })
}
