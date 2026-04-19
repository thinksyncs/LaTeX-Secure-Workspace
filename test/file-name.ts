import * as path from 'path'

export function testFileStem(fileName: string) {
    return path.basename(fileName).replace(/\.test\.[cm]?[jt]s$/, '')
}

export function testFileSuiteName(fileName: string) {
    return `${testFileStem(fileName)}:`
}
