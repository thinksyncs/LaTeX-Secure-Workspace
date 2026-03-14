import * as path from 'path'
import * as workerpool from 'workerpool'
import type * as Ast from '@unified-latex/unified-latex-types'
// import { getParser } from '@unified-latex/unified-latex-util-parse'
// import { attachMacroArgs } from '@unified-latex/unified-latex-util-arguments'
import { bibtexParser } from 'latex-utensils'

type UnifiedModule = {
    attachMacroArgs: (ast: Ast.Root, macros: Ast.MacroInfoRecord) => void
    getParser: (opts: { macros?: Ast.MacroInfoRecord, environments?: Ast.EnvInfoRecord, flags: { autodetectExpl3AndAtLetter: boolean } }) => UnifiedParser
}

type UnifiedParser = { parse: (content: string) => Ast.Root }
const { getParser, attachMacroArgs } = require(path.resolve(__dirname, '../../../../resources/unified.js')) as UnifiedModule

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
let unifiedParser: UnifiedParser = getParser({ flags: { autodetectExpl3AndAtLetter: true } })

function parseLaTeX(content: string): Ast.Root {
    return unifiedParser.parse(content)
}

function parseArgs(ast: Ast.Root, macros: Ast.MacroInfoRecord) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    attachMacroArgs(ast, macros)
}

function reset(macros: Ast.MacroInfoRecord, environments: Ast.EnvInfoRecord) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
    unifiedParser = getParser({ macros, environments, flags: { autodetectExpl3AndAtLetter: true } })
}

function parseBibTeX(s: string): bibtexParser.BibtexAst | string | undefined {
    try {
        return bibtexParser.parse(s)
    } catch (err) {
        if (bibtexParser.isSyntaxError(err)) {
            return JSON.stringify(err)
        }
        return undefined
    }
}

const worker = {
    parseLaTeX,
    parseArgs,
    reset,
    parseBibTeX
}

workerpool.worker(worker)

export type Worker = typeof worker
