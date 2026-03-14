import * as fs from 'fs'
import * as path from 'path'
import { lw } from './lw'
import { log } from './utils/logger'

lw.extensionRoot = resolveExtensionRoot(__dirname)
lw.log = log.getLogger
log.initStatusBarItem()

const app = require('./app') as typeof import('./app')

export const activate = app.activate

function resolveExtensionRoot(currentDir: string): string {
    const parentDir = path.resolve(currentDir, '..')
    if (fs.existsSync(path.join(parentDir, 'package.json'))) {
        return parentDir
    }
    return path.resolve(currentDir, '..', '..')
}
