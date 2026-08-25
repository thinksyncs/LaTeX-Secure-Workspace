export type TestFixture = 'testground' | 'multiroot' | 'unittest'

function selectSuiteFixtures(value: string): TestFixture[] {
    const selectedSuites = value.split(',').map(suite => suite.trim()).filter(Boolean)
    if (selectedSuites.length === 0) {
        return ['testground', 'multiroot']
    }

    const fixtures: TestFixture[] = []
    if (selectedSuites.some(suite => !'99_multiroot'.includes(suite))) {
        fixtures.push('testground')
    }
    if (selectedSuites.some(suite => '99_multiroot'.includes(suite))) {
        fixtures.push('multiroot')
    }
    return fixtures
}

export function selectTestFixtures(env: NodeJS.ProcessEnv = process.env): TestFixture[] {
    const fixtures: TestFixture[] = []
    if (!env.LATEXWORKSHOP_SUITE || env.LATEXWORKSHOP_UNIT) {
        fixtures.push('unittest')
    }
    if (!env.LATEXWORKSHOP_UNIT || env.LATEXWORKSHOP_SUITE) {
        fixtures.push(...(env.LATEXWORKSHOP_SUITE
            ? selectSuiteFixtures(env.LATEXWORKSHOP_SUITE)
            : ['testground', 'multiroot'] as TestFixture[]))
    }
    return fixtures
}
