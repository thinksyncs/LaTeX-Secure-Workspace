import esbuild from 'esbuild'
import fs from 'node:fs/promises'
import path from 'path'
import process from 'node:process'

const sharedOptions = {
  absWorkingDir: process.cwd(),
  bundle: true,
  format: 'cjs',
  platform: 'node',
  sourcemap: true,
  target: ['node20'],
  tsconfig: path.join(process.cwd(), 'tsconfig.json'),
}

await esbuild.build({
  ...sharedOptions,
  entryPoints: [path.join('src', 'main.ts')],
  external: ['vscode'],
  outfile: path.join('out', 'extension.js'),
})

await esbuild.build({
  ...sharedOptions,
  entryPoints: [path.join('src', 'parse', 'parser', 'unified.ts')],
  outfile: path.join('out', 'src', 'parse', 'parser', 'unified.js'),
})

await esbuild.build({
  ...sharedOptions,
  entryPoints: [path.join('src', 'preview', 'mathjax', 'mathjax.ts')],
  outfile: path.join('out', 'src', 'preview', 'mathjax', 'mathjax.js'),
})

await esbuild.build({
  ...sharedOptions,
  entryPoints: [path.join('dev', 'unified.ts')],
  sourcemap: false,
  outfile: path.join('out', 'unified.js'),
})

const pdfjsSourceRoot = path.join(process.cwd(), 'node_modules', 'pdfjs-dist')
const pdfjsOutputRoot = path.join(process.cwd(), 'out', 'pdfjs')
await fs.rm(pdfjsOutputRoot, { force: true, recursive: true })
await fs.mkdir(path.join(pdfjsOutputRoot, 'build'), { recursive: true })

await Promise.all([
  fs.copyFile(path.join(pdfjsSourceRoot, 'LICENSE'), path.join(pdfjsOutputRoot, 'LICENSE')),
  fs.copyFile(path.join(pdfjsSourceRoot, 'package.json'), path.join(pdfjsOutputRoot, 'package.json')),
  fs.copyFile(path.join(pdfjsSourceRoot, 'build', 'pdf.mjs'), path.join(pdfjsOutputRoot, 'build', 'pdf.mjs')),
  fs.copyFile(path.join(pdfjsSourceRoot, 'build', 'pdf.worker.mjs'), path.join(pdfjsOutputRoot, 'build', 'pdf.worker.mjs')),
  ...['cmaps', 'standard_fonts', 'wasm'].map(directory =>
    fs.cp(path.join(pdfjsSourceRoot, directory), path.join(pdfjsOutputRoot, directory), { recursive: true })
  ),
])
