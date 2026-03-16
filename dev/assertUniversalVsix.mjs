import { execFileSync } from 'node:child_process'

const vsixPath = process.argv[2]

if (!vsixPath) {
  console.error('Usage: node ./dev/assertUniversalVsix.mjs <path-to-vsix>')
  process.exit(1)
}

const manifest = execFileSync('unzip', ['-p', vsixPath, 'extension.vsixmanifest'], {
  encoding: 'utf8'
})

if (/TargetPlatform\s*=/.test(manifest)) {
  console.error(`Expected a universal VSIX, but TargetPlatform was present in ${vsixPath}.`)
  process.exit(1)
}

if (!/<InstallationTarget Id="Microsoft\.VisualStudio\.Code"\/>/.test(manifest)) {
  console.error(`Could not find the VS Code installation target in ${vsixPath}.`)
  process.exit(1)
}

console.log(`Verified universal VSIX manifest: ${vsixPath}`)
