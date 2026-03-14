import { writeFileSync } from 'node:fs'

const outputPath = process.argv[2]
if (!outputPath) {
    throw new Error('Usage: node ./dev/buildDailyReleaseNotes.mjs <output-path>')
}

const token = process.env.GITHUB_TOKEN
const repository = process.env.GITHUB_REPOSITORY
if (!token || !repository) {
    throw new Error('GITHUB_TOKEN and GITHUB_REPOSITORY are required')
}

const [owner, repo] = repository.split('/')
if (!owner || !repo) {
    throw new Error(`Invalid GITHUB_REPOSITORY: ${repository}`)
}

const baseUrl = `https://api.github.com/repos/${owner}/${repo}`
const headers = {
    'Accept': 'application/vnd.github+json',
    'Authorization': `Bearer ${token}`,
    'User-Agent': 'latex-workspace-secure-daily-release'
}

async function getJson(path) {
    const response = await fetch(`${baseUrl}${path}`, { headers })
    if (!response.ok) {
        return { error: `${response.status} ${response.statusText}` }
    }
    return response.json()
}

function summarizeBySeverity(items, selector) {
    const counts = new Map()
    for (const item of items) {
        const severity = selector(item) ?? 'unknown'
        counts.set(severity, (counts.get(severity) ?? 0) + 1)
    }
    return [ ...counts.entries() ]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([severity, count]) => `${severity}: ${count}`)
        .join(', ')
}

function renderList(title, items, renderItem, error) {
    if (error) {
        return `## ${title}\n\nUnavailable: ${error}\n`
    }
    if (items.length === 0) {
        return `## ${title}\n\n- None\n`
    }
    return `## ${title}\n\n${items.map(renderItem).join('\n')}\n`
}

const pullsResponse = await getJson('/pulls?state=open&per_page=10')
const codeScanningResponse = await getJson('/code-scanning/alerts?state=open&per_page=20')
const dependabotResponse = await getJson('/dependabot/alerts?state=open&per_page=20')

const pulls = Array.isArray(pullsResponse) ? pullsResponse : []
const codeqlAlerts = Array.isArray(codeScanningResponse)
    ? codeScanningResponse.filter(alert => (alert.tool?.name ?? '').toLowerCase().includes('codeql'))
    : []
const dependabotAlerts = Array.isArray(dependabotResponse) ? dependabotResponse : []

const stableVersion = process.env.STABLE_VERSION ?? 'unknown'
const dailyVersion = process.env.DAILY_VERSION ?? 'unknown'
const sha = process.env.GITHUB_SHA ?? 'unknown'
const runNumber = process.env.GITHUB_RUN_NUMBER ?? 'unknown'
const generatedAt = new Date().toISOString()

const notes = [
    '# Daily Pre-release',
    '',
    '- Channel: Marketplace pre-release',
    `- Stable base version: ${stableVersion}`,
    `- Daily version: ${dailyVersion}`,
    `- GitHub run number: ${runNumber}`,
    `- Commit: ${sha}`,
    `- Generated at: ${generatedAt}`,
    '',
    renderList(
        'Open Pull Requests',
        pulls,
        pull => `- [#${pull.number}](${pull.html_url}) ${pull.title} (@${pull.user?.login ?? 'unknown'})`,
        pullsResponse.error
    ).trimEnd(),
    '',
    codeScanningResponse.error
        ? `## Open CodeQL Alerts\n\nUnavailable: ${codeScanningResponse.error}\n`
        : [
            '## Open CodeQL Alerts',
            '',
            `- Summary: ${summarizeBySeverity(codeqlAlerts, alert => alert.rule?.security_severity_level ?? alert.rule?.severity) || 'none'}`,
            ...(codeqlAlerts.length === 0
                ? [ '- None' ]
                : codeqlAlerts.slice(0, 10).map(alert =>
                    `- [${alert.rule?.id ?? 'unknown'}](${alert.html_url}) ${alert.most_recent_instance?.location?.path ?? 'unknown path'} (${alert.rule?.security_severity_level ?? alert.rule?.severity ?? 'unknown'})`
                ))
        ].join('\n'),
    '',
    dependabotResponse.error
        ? `## Open Dependabot Alerts\n\nUnavailable: ${dependabotResponse.error}\n`
        : [
            '## Open Dependabot Alerts',
            '',
            `- Summary: ${summarizeBySeverity(dependabotAlerts, alert => alert.security_advisory?.severity) || 'none'}`,
            ...(dependabotAlerts.length === 0
                ? [ '- None' ]
                : dependabotAlerts.slice(0, 10).map(alert =>
                    `- [${alert.dependency?.package?.name ?? 'unknown'}](${alert.html_url}) ${alert.security_advisory?.summary ?? 'No summary'} (${alert.security_advisory?.severity ?? 'unknown'})`
                ))
        ].join('\n'),
    ''
].join('\n')

writeFileSync(outputPath, notes, 'utf8')
