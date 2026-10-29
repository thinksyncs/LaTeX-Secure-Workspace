'use strict'

const assert = require('node:assert/strict')
const fs = require('node:fs')
const http = require('node:http')
const { createRequire } = require('node:module')
const path = require('node:path')
const test = require('node:test')

// Resolve through the actual consumers, including nested dependency copies.
const fromVsce = createRequire(require.resolve('@vscode/vsce'))
const fromIdentity = createRequire(fromVsce.resolve('@azure/identity'))
const msal = fromIdentity('@azure/msal-node')
const redirects = createRequire(require.resolve('ovsx/package.json'))('follow-redirects')
const serialize = createRequire(require.resolve('mocha'))('serialize-javascript')
const qs = createRequire(fromVsce.resolve('typed-rest-client/HttpClient'))('qs')

test('tooling lockfile excludes the reported vulnerable dependency versions', () => {
    const semver = fromVsce('semver')
    const lock = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package-lock.json'), 'utf8'))
    for (const [name, minimum] of Object.entries({
        '@azure/msal-node': '7.1.0', 'follow-redirects': '1.16.1',
        'serialize-javascript': '7.1.3', qs: '6.16.1'
    })) {
        const copies = Object.entries(lock.packages).filter(([key]) => key.endsWith(`node_modules/${name}`))
        assert.ok(copies.length > 0, name)
        for (const [key, entry] of copies) {
            assert.ok(semver.gte(entry.version, minimum), `${key}: ${entry.version} < ${minimum}`)
            assert.equal(entry.dev, true, `${key} must remain a tooling dependency`)
        }
    }
})

test('serialization escapes closing-script suffixes and retains ordinary values', () => {
    for (const suffix of ['</script', '</ScRiPt', '</script ', '</script>']) {
        const fixture = function () { return 1 }
        fixture.toString = () => `function fixture() { return 1 } //${suffix}`
        assert.doesNotMatch(serialize({ fixture }, { space: 2 }), /<\/script(?=[\s/>]|$)/i)
    }
    assert.equal(serialize({ text: '日本語', values: [1, true] }), '{"text":"日本語","values":[1,true]}')
    assert.match(serialize(function control() { return 1 }), /function control/)
})

test('comma query serialization handles non-callable and absent toString safely', () => {
    for (const encodeValuesOnly of [false, true]) {
        for (const value of [{ toString: 'x' }, { toString: null }, Object.assign(Object.create(null), { key: 'value' })]) {
            assert.doesNotThrow(() => qs.stringify({ a: [value] }, { arrayFormat: 'comma', encodeValuesOnly }))
        }
        assert.equal(qs.stringify({ a: ['x', 'y'] }, { arrayFormat: 'comma', encodeValuesOnly }),
            encodeValuesOnly ? 'a=x,y' : 'a=x%2Cy')
    }
})

async function listen(t, handler) {
    const server = http.createServer(handler)
    t.after(async () => {
        server.closeAllConnections()
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    })
    await new Promise((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
    })
    return `http://127.0.0.1:${server.address().port}`
}

function getHeaders(url, headers, sensitiveHeaders = []) {
    return new Promise((resolve, reject) => {
        // Redirect processing mutates its header container; each request needs a fresh one.
        const requestHeaders = Array.isArray(headers) ? headers.slice() : { ...headers }
        const request = redirects.http.get(url, { headers: requestHeaders, sensitiveHeaders, maxRedirects: 3 }, response => {
            let body = ''
            response.setEncoding('utf8')
            response.on('data', chunk => { body += chunk })
            response.on('error', reject)
            response.on('end', () => {
                try { resolve(JSON.parse(body)) } catch (error) { reject(error) }
            })
        })
        request.setTimeout(3000, () => request.destroy(new Error('Local redirect test timed out')))
        request.on('error', reject)
    })
}

test('cross-origin redirects strip array and regex-sensitive credentials', { timeout: 15000 }, async t => {
    const target = await listen(t, (request, response) => response.end(JSON.stringify(request.headers)))
    const source = await listen(t, (request, response) => {
        if (request.url === '/same') {
            response.writeHead(302, { location: '/echo' }).end()
        } else if (request.url === '/echo') {
            response.end(JSON.stringify(request.headers))
        } else {
            response.writeHead(302, { location: target }).end()
        }
    })
    const headers = { Authorization: 'fixture', Cookie: 'fixture', 'Proxy-Authorization': 'fixture',
        'X-Token^Key': 'fixture', 'X-Token|Key': 'fixture', 'X-Public': 'keep' }
    for (const representation of [headers, Object.entries(headers).flat()]) {
        const result = await getHeaders(source, representation, ['X-Token^Key', 'X-Token|Key'])
        for (const key of Object.keys(headers).filter(key => key !== 'X-Public')) {
            assert.equal(result[key.toLowerCase()], undefined, key)
        }
        assert.equal(result['x-public'], 'keep')
        const control = await getHeaders(`${source}/same`, representation)
        assert.equal(control.authorization, 'fixture')
        assert.equal(control['x-public'], 'keep')
    }
})

function clientConfig() {
    return { auth: { clientId: 'test-client', clientSecret: 'fixture-only' } }
}

test('MSAL confidential clients discard untrusted authority hints before delegation', async t => {
    const base = Object.getPrototypeOf(msal.ConfidentialClientApplication.prototype)
    const captured = []
    t.mock.method(base, 'acquireTokenByCode', async (request, payload) => {
        captured.push({ request, payload })
        return { accessToken: 'fixture-only' }
    })
    const client = new msal.ConfidentialClientApplication(clientConfig())
    const request = { code: 'request-code', nonce: 'request-nonce', scopes: ['scope'], redirectUri: 'http://localhost' }
    await client.acquireTokenByCode(request, {
        code: 'payload-code', state: 'returned-state', nonce: 'payload-nonce',
        cloud_instance_host_name: 'untrusted.invalid', cloud_instance_name: 'other-cloud',
        cloud_graph_host_name: 'untrusted.invalid', msgraph_host: 'untrusted.invalid', client_info: 'untrusted'
    })
    assert.deepEqual(captured[0], { request, payload: { code: request.code, state: 'returned-state', nonce: request.nonce } })
    await client.acquireTokenByCode(request)
    assert.deepEqual(captured[1], { request, payload: undefined })
})

test('MSAL rejects unsupported instance-aware confidential-client inputs', async () => {
    const config = clientConfig()
    config.auth.instanceAware = true
    assert.throws(() => new msal.ConfidentialClientApplication(config), { errorCode: 'unsupported_cca_instance_aware' })
    const client = new msal.ConfidentialClientApplication(clientConfig())
    for (const value of ['true', 'false', '']) {
        await assert.rejects(client.getAuthCodeUrl({ scopes: ['scope'], redirectUri: 'http://localhost',
            extraQueryParameters: { instance_aware: value } }), { errorCode: 'unsupported_cca_instance_aware' })
    }
    await assert.rejects(client.acquireTokenByCode({ code: 'fixture', state: 'expected', scopes: ['scope'],
        redirectUri: 'http://localhost' }, { code: 'fixture', state: 'wrong' }), { errorCode: 'state_mismatch' })
})
