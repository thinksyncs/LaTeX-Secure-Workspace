import esbuild from 'esbuild'
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
