import * as fs from 'fs'
import * as path from 'path'
import { assert } from './utils'

describe(path.basename(__filename).split('.')[0] + ':', () => {
    it('should keep unified runtime helpers in production dependencies', () => {
        const packageJson = JSON.parse(
            fs.readFileSync(path.resolve(__dirname, '../../../package.json'), 'utf8')
        ) as { dependencies?: Record<string, string> }

        assert.strictEqual(packageJson.dependencies?.['@unified-latex/unified-latex-util-arguments'], '1.8.1')
        assert.strictEqual(packageJson.dependencies?.['@unified-latex/unified-latex-util-parse'], '1.8.1')
        assert.strictEqual(packageJson.dependencies?.['@unified-latex/unified-latex-util-to-string'], '1.8.1')
    })
})
