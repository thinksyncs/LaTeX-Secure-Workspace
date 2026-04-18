const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const moduleUrl = pathToFileURL(path.resolve(__dirname, '../../dev/resolvePublishPlan.mjs')).href

test('resolvePublishPlan fails closed in the canonical repository when publish secrets are missing', async () => {
    const { resolvePublishPlan } = await import(moduleUrl)

    const plan = resolvePublishPlan({
        currentRepository: 'thinksyncs/LaTeX-Secure-Workspace',
        publishOpenVsx: true,
        hasVscePat: false,
        hasOvsxPat: false
    })

    assert.equal(plan.isCanonicalRepository, true)
    assert.equal(plan.publishMarketplace, false)
    assert.equal(plan.publishOpenVsx, false)
    assert.deepEqual(plan.errors, [
        'VSCE_PAT is required in thinksyncs/LaTeX-Secure-Workspace for Marketplace publishing.',
        'OVSX_PAT is required in thinksyncs/LaTeX-Secure-Workspace for Open VSX publishing.'
    ])
})

test('resolvePublishPlan allows forked repositories to skip missing registry secrets', async () => {
    const { resolvePublishPlan } = await import(moduleUrl)

    const plan = resolvePublishPlan({
        currentRepository: 'someone/fork',
        publishOpenVsx: true,
        hasVscePat: false,
        hasOvsxPat: false
    })

    assert.equal(plan.isCanonicalRepository, false)
    assert.equal(plan.publishMarketplace, false)
    assert.equal(plan.publishOpenVsx, false)
    assert.deepEqual(plan.errors, [])
})

test('resolvePublishPlan honors daily prerelease publishing without requiring Open VSX', async () => {
    const { resolvePublishPlan } = await import(moduleUrl)

    const plan = resolvePublishPlan({
        currentRepository: 'thinksyncs/LaTeX-Secure-Workspace',
        publishOpenVsx: false,
        hasVscePat: true,
        hasOvsxPat: false
    })

    assert.equal(plan.publishMarketplace, true)
    assert.equal(plan.publishOpenVsx, false)
    assert.deepEqual(plan.errors, [])
})
