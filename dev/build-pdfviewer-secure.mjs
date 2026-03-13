import esbuild from 'esbuild'
import path from 'path'
import process from 'node:process'

await esbuild.build({
  absWorkingDir: process.cwd(),
  bundle: true,
  entryPoints: [path.join('vendor', 'pdfviewer-secure', 'src', 'webview', 'entry.ts')],
  format: 'iife',
  outfile: path.join('out', 'vendor', 'pdfviewer-secure', 'webview', 'main.js'),
  platform: 'browser',
  target: ['es2021'],
})
