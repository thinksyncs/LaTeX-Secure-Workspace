import * as sinon from 'sinon'
import { assert, hooks } from './utils'
import { lw } from '../../src/lw'
import { terminate } from '../../src/compile/terminate'
import { queue } from '../../src/compile/queue'

describe('29_compile_terminate:', () => {
    let platform: PropertyDescriptor | undefined

    const setPlatform = (newPlatform: NodeJS.Platform) => {
        Object.defineProperty(process, 'platform', { value: newPlatform })
    }

    before(() => {
        platform = Object.getOwnPropertyDescriptor(process, 'platform')
    })

    beforeEach(() => {
        hooks.beforeEach()
        sinon.stub(queue, 'clear')
        sinon.stub(lw.external, 'spawnSync')
        lw.compile.process = {
            pid: 4242,
            kill: sinon.stub()
        } as unknown as typeof lw.compile.process
    })

    afterEach(function (this: Mocha.Context) {
        if (platform !== undefined) {
            Object.defineProperty(process, 'platform', platform)
        }
        lw.compile.process = undefined
        sinon.restore()
        return hooks.afterEach.call(this)
    })

    it('should use pkill arguments instead of a shell command on unix', () => {
        setPlatform('darwin')
        const killStub = lw.compile.process?.kill as unknown as sinon.SinonStub

        terminate()

        assert.ok((lw.external.spawnSync as sinon.SinonStub).calledOnceWithExactly('pkill', ['-P', '4242'], { timeout: 1000 }))
        assert.ok(killStub.calledOnce)
        assert.ok((queue.clear as sinon.SinonStub).calledOnce)
    })

    it('should use taskkill arguments instead of a shell command on windows', () => {
        setPlatform('win32')
        const killStub = sinon.stub()
        lw.compile.process = {
            pid: 4242,
            kill: killStub
        } as unknown as typeof lw.compile.process

        terminate()

        assert.ok((lw.external.spawnSync as sinon.SinonStub).calledOnceWithExactly('taskkill', ['/F', '/T', '/PID', '4242'], { timeout: 1000 }))
        assert.ok(killStub.calledOnce)
        assert.ok((queue.clear as sinon.SinonStub).calledOnce)
    })
})
