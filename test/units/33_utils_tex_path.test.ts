import { assert } from './utils'
import { ensureMacTeXBinOnPath, MAC_TEX_BIN } from '../../src/utils/tex-path'

describe('33_utils_tex_path:', () => {
    it('should prepend the standard MacTeX directory on macOS', () => {
        const env = { PATH: '/usr/bin:/bin' }

        const changed = ensureMacTeXBinOnPath('darwin', env, () => true)

        assert.strictEqual(changed, true)
        assert.strictEqual(env.PATH, `${MAC_TEX_BIN}:/usr/bin:/bin`)
    })

    it('should not duplicate the standard MacTeX directory', () => {
        const env = { PATH: `${MAC_TEX_BIN}:/usr/bin` }

        const changed = ensureMacTeXBinOnPath('darwin', env, () => true)

        assert.strictEqual(changed, false)
        assert.strictEqual(env.PATH, `${MAC_TEX_BIN}:/usr/bin`)
    })

    it('should not change PATH when MacTeX is absent', () => {
        const env = { PATH: '/usr/bin:/bin' }

        const changed = ensureMacTeXBinOnPath('darwin', env, () => false)

        assert.strictEqual(changed, false)
        assert.strictEqual(env.PATH, '/usr/bin:/bin')
    })

    it('should not change PATH on other platforms', () => {
        const env = { PATH: '/usr/bin:/bin' }

        const changed = ensureMacTeXBinOnPath('linux', env, () => true)

        assert.strictEqual(changed, false)
        assert.strictEqual(env.PATH, '/usr/bin:/bin')
    })
})
