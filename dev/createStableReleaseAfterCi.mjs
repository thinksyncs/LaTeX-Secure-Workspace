#!/usr/bin/env node

import { readFileSync } from 'node:fs'

const requiredWorkflows = (process.env.AUTORELEASE_REQUIRED_WORKFLOWS ?? '')
    .split(',')
    .map(name => name.trim())
    .filter(Boolean)

const token = process.env.GITHUB_TOKEN
const repository = process.env.GITHUB_REPOSITORY
const canonicalRepository = process.env.CANONICAL_REPOSITORY ?? 'thinksyncs/LaTeX-Secure-Workspace'
const headSha = process.env.AUTORELEASE_HEAD_SHA
const headBranch = process.env.AUTORELEASE_HEAD_BRANCH
const defaultBranch = process.env.AUTORELEASE_DEFAULT_BRANCH ?? 'master'
const stableReleaseWorkflow = process.env.AUTORELEASE_STABLE_WORKFLOW ?? 'stable-release.yml'

function info(message) {
    console.log(`[auto-stable-release] ${message}`)
}

function fail(message) {
    throw new Error(`[auto-stable-release] ${message}`)
}

if (!token) {
    fail('GITHUB_TOKEN is required.')
}
if (!repository || !repository.includes('/')) {
    fail('GITHUB_REPOSITORY must be owner/repo.')
}
if (!headSha) {
    fail('AUTORELEASE_HEAD_SHA is required.')
}
if (repository !== canonicalRepository) {
    info(`Skipping ${repository}; canonical repository is ${canonicalRepository}.`)
    process.exit(0)
}
if (headBranch !== defaultBranch) {
    info(`Skipping branch ${headBranch}; default release branch is ${defaultBranch}.`)
    process.exit(0)
}
if (requiredWorkflows.length === 0) {
    fail('AUTORELEASE_REQUIRED_WORKFLOWS must list at least one workflow.')
}

const [owner, repo] = repository.split('/')
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const version = packageJson.version
const tagName = `v${version}`

if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`Stable auto-release requires a plain semver package version, got ${version}.`)
}

async function github(path, options = {}) {
    const response = await fetch(`https://api.github.com${path}`, {
        ...options,
        headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            'x-github-api-version': '2022-11-28',
            ...(options.headers ?? {})
        }
    })
    if (response.status === 204) {
        return undefined
    }
    const text = await response.text()
    const body = text ? JSON.parse(text) : undefined
    if (!response.ok) {
        const message = body?.message ?? text
        fail(`${options.method ?? 'GET'} ${path} failed: ${response.status} ${message}`)
    }
    return body
}

async function releaseExists() {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/tags/${tagName}`, {
        headers: {
            accept: 'application/vnd.github+json',
            authorization: `Bearer ${token}`,
            'x-github-api-version': '2022-11-28'
        }
    })
    if (response.status === 404) {
        return false
    }
    if (!response.ok) {
        const text = await response.text()
        fail(`GET release ${tagName} failed: ${response.status} ${text}`)
    }
    return true
}

const branch = await github(`/repos/${owner}/${repo}/branches/${defaultBranch}`)
const branchSha = branch?.commit?.sha
if (branchSha !== headSha) {
    info(`Skipping ${headSha}; ${defaultBranch} now points to ${branchSha}.`)
    process.exit(0)
}

if (await releaseExists()) {
    info(`Release ${tagName} already exists.`)
    process.exit(0)
}

const runs = await github(`/repos/${owner}/${repo}/actions/runs?head_sha=${headSha}&per_page=100`)
const workflowRuns = runs.workflow_runs ?? []
const missingOrNotGreen = []

for (const workflowName of requiredWorkflows) {
    const matchingRuns = workflowRuns
        .filter(run => run.name === workflowName && run.head_sha === headSha && run.event === 'push')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    const run = matchingRuns[0]
    if (!run) {
        missingOrNotGreen.push(`${workflowName}: missing`)
    } else if (run.status !== 'completed' || run.conclusion !== 'success') {
        missingOrNotGreen.push(`${workflowName}: ${run.status}/${run.conclusion ?? 'pending'}`)
    }
}

if (missingOrNotGreen.length > 0) {
    info(`Waiting for green CI on ${headSha}: ${missingOrNotGreen.join(', ')}`)
    process.exit(0)
}

const body = [
    `Automated stable release for ${tagName}.`,
    '',
    `Created after required CI passed on ${headSha}.`,
    '',
    'Required workflows:',
    ...requiredWorkflows.map(name => `- ${name}`)
].join('\n')

const release = await github(`/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    body: JSON.stringify({
        tag_name: tagName,
        target_commitish: headSha,
        name: tagName,
        body,
        draft: false,
        prerelease: false,
        make_latest: 'true'
    })
})

info(`Created ${tagName}: ${release.html_url}`)

await github(`/repos/${owner}/${repo}/actions/workflows/${stableReleaseWorkflow}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({
        ref: defaultBranch,
        inputs: {
            release_tag: tagName
        }
    })
})

info(`Dispatched ${stableReleaseWorkflow} for ${tagName}.`)
