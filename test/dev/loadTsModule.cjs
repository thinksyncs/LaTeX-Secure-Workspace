const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const ts = require('typescript')

function loadTsModule(modulePath) {
    const absolutePath = path.resolve(modulePath)
    const source = fs.readFileSync(absolutePath, 'utf8')
    const transpiled = ts.transpileModule(source, {
        compilerOptions: {
            esModuleInterop: true,
            module: ts.ModuleKind.CommonJS,
            sourceMap: false,
            target: ts.ScriptTarget.ES2021,
        },
        fileName: absolutePath,
    })

    const loadedModule = new Module(absolutePath, module)
    loadedModule.filename = absolutePath
    loadedModule.paths = Module._nodeModulePaths(path.dirname(absolutePath))
    loadedModule._compile(transpiled.outputText, absolutePath)
    return loadedModule.exports
}

module.exports = {
    loadTsModule,
}
