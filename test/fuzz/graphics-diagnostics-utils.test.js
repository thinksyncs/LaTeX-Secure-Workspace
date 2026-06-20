const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')
const ts = require('typescript')

const {
  buildImageResolution,
  buildUnsupportedExtensionCandidates,
  collectGraphicspathDirs,
  collectIncludeGraphics,
  isUnsupportedImageExtension
} = loadTypescriptModule('../../src/lint/graphics-diagnostics-utils.ts')

function loadTypescriptModule(relativePath) {
  const filename = path.resolve(__dirname, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021
    },
    fileName: filename
  }).outputText
  const mod = new Module(filename, module)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(output, filename)
  return mod.exports
}

test('collectIncludeGraphics skips comments and extracts stable ranges', () => {
  const source = [
    '% \\includegraphics{ignored}',
    '\\includegraphics[width=0.5\\textwidth]{figures/plot}',
    '\\includegraphics{diagram.pdf}'
  ].join('\n')

  const includes = collectIncludeGraphics(source)

  assert.deepEqual(includes.map(include => include.imagePath), ['figures/plot', 'diagram.pdf'])
  assert.equal(source.slice(includes[0].index, includes[0].index + includes[0].length), 'figures/plot')
})

test('collectGraphicspathDirs reads multiple graphicspath directories', () => {
  const dirs = collectGraphicspathDirs('\\graphicspath{{figures/}{../shared images/}}\n')

  assert.deepEqual(dirs, ['figures/', '../shared images/'])
})

test('buildImageResolution searches document, root, and graphicspath directories', () => {
  const resolution = buildImageResolution('plot', '/repo/chapter', '/repo', ['figures/'])

  assert.deepEqual(resolution.candidates, [
    path.resolve('/repo/chapter/plot.pdf'),
    path.resolve('/repo/chapter/plot.png'),
    path.resolve('/repo/chapter/plot.jpg'),
    path.resolve('/repo/chapter/plot.jpeg'),
    path.resolve('/repo/chapter/figures/plot.pdf'),
    path.resolve('/repo/chapter/figures/plot.png'),
    path.resolve('/repo/chapter/figures/plot.jpg'),
    path.resolve('/repo/chapter/figures/plot.jpeg'),
    path.resolve('/repo/plot.pdf'),
    path.resolve('/repo/plot.png'),
    path.resolve('/repo/plot.jpg'),
    path.resolve('/repo/plot.jpeg'),
    path.resolve('/repo/figures/plot.pdf'),
    path.resolve('/repo/figures/plot.png'),
    path.resolve('/repo/figures/plot.jpg'),
    path.resolve('/repo/figures/plot.jpeg')
  ])
})

test('unsupported extension helpers flag risky image formats', () => {
  assert.equal(isUnsupportedImageExtension('figure.svg'), true)
  assert.equal(isUnsupportedImageExtension('.eps'), true)
  assert.equal(isUnsupportedImageExtension('figure.pdf'), false)

  assert.deepEqual(buildUnsupportedExtensionCandidates('figure', '/repo', undefined, ['img/']), [
    path.resolve('/repo/figure.eps'),
    path.resolve('/repo/figure.svg'),
    path.resolve('/repo/figure.gif'),
    path.resolve('/repo/figure.tif'),
    path.resolve('/repo/figure.tiff'),
    path.resolve('/repo/figure.webp'),
    path.resolve('/repo/img/figure.eps'),
    path.resolve('/repo/img/figure.svg'),
    path.resolve('/repo/img/figure.gif'),
    path.resolve('/repo/img/figure.tif'),
    path.resolve('/repo/img/figure.tiff'),
    path.resolve('/repo/img/figure.webp')
  ])
})
