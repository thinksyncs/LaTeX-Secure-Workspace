import { pathToFileURL } from 'node:url'

function toBoolean(value) {
    return value === true || value === 'true'
}

export function resolvePublishPlan({
    currentRepository = '',
    canonicalRepository = 'thinksyncs/LaTeX-Secure-Workspace',
    publishOpenVsx = true,
    hasVscePat = false,
    hasOvsxPat = false
} = {}) {
    const shouldPublishOpenVsx = toBoolean(publishOpenVsx)
    const isCanonicalRepository = currentRepository === canonicalRepository
    const errors = []

    if (isCanonicalRepository && !hasVscePat) {
        errors.push(`VSCE_PAT is required in ${canonicalRepository} for Marketplace publishing.`)
    }
    if (isCanonicalRepository && shouldPublishOpenVsx && !hasOvsxPat) {
        errors.push(`OVSX_PAT is required in ${canonicalRepository} for Open VSX publishing.`)
    }

    return {
        errors,
        isCanonicalRepository,
        publishMarketplace: hasVscePat,
        publishOpenVsx: shouldPublishOpenVsx && hasOvsxPat
    }
}

function main() {
    const plan = resolvePublishPlan({
        currentRepository: process.env.GITHUB_REPOSITORY ?? '',
        canonicalRepository: process.env.CANONICAL_REPOSITORY ?? 'thinksyncs/LaTeX-Secure-Workspace',
        publishOpenVsx: process.env.PUBLISH_OPENVSX ?? 'true',
        hasVscePat: Boolean(process.env.VSCE_PAT),
        hasOvsxPat: Boolean(process.env.OVSX_PAT)
    })

    if (!plan.publishMarketplace) {
        console.log('Skipping VS Marketplace publish because VSCE_PAT is not configured.')
    }
    if ((process.env.PUBLISH_OPENVSX ?? 'true') === 'true' && !plan.publishOpenVsx) {
        console.log('Skipping Open VSX publish because OVSX_PAT is not configured.')
    }

    process.stdout.write(`publish_marketplace=${plan.publishMarketplace}\n`)
    process.stdout.write(`publish_openvsx=${plan.publishOpenVsx}\n`)
    process.stdout.write(`is_canonical_repository=${plan.isCanonicalRepository}\n`)

    if (plan.errors.length > 0) {
        for (const error of plan.errors) {
            console.error(error)
        }
        process.exit(1)
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main()
}
