// PROTOTYPE (ticket 10). `@ts-expect-error` swallows every error on its line,
// TS2321 included: September's `.raw` row hid one that way. This compiles the
// project with every directive blanked out and counts only TS2321/TS2589.
// Usage: node scripts/unmasked-deep.mjs <tsconfig>
import ts from 'typescript'

const [, , project] = process.argv
const sys = {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic: (d) => {
    throw new Error(String(d.messageText))
  },
}
const cfg = ts.getParsedCommandLineOfConfigFile(project, {}, sys)
const host = ts.createCompilerHost(cfg.options)
const read = host.readFile.bind(host)
host.readFile = (file) => {
  const text = read(file)
  return text && !file.includes('node_modules') && !file.endsWith('.d.ts')
    ? text.replaceAll('@ts-expect-error', 'expect-error (unmasked)')
    : text
}
const program = ts.createProgram(cfg.fileNames, cfg.options, host)
const deep = ts
  .getPreEmitDiagnostics(program)
  .filter((d) => d.code === 2321 || d.code === 2589)
for (const d of deep) {
  const at =
    d.file && d.start !== undefined
      ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
      : '?'
  console.log(
    `TS${d.code} ${d.file?.fileName.split('/').slice(-2).join('/')}:${at}`
  )
}
console.log(
  `${deep.length} deep diagnostics with every @ts-expect-error unmasked`
)
process.exitCode = deep.length === 0 ? 0 : 1
