// Run `npx esbuild dev/unified.ts --platform=node --format=cjs --packages=external --outfile=resources/unified.js`
// to keep dependency code external and avoid vendoring large bundled helpers.

import { getParser } from '@unified-latex/unified-latex-util-parse'
import { attachMacroArgs } from '@unified-latex/unified-latex-util-arguments'
import { toString } from '@unified-latex/unified-latex-util-to-string'

export const unified = {
    getParser,
    attachMacroArgs,
    toString
}
