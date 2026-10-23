// PROTOTYPE (ticket 10). TS2321/TS2589 are order-dependent: a type the checker
// first meets deep inside another comparison can exceed the depth limit where
// meeting it first would not. tsc checks root files in include order; an
// editor checks the open file first. This runs one program per root file,
// checks that file first and then every other, and reports what each order
// produces.
// Deep diagnostics inside lib/ sit on generic declarations; the shipped
// package is .d.ts, which skipLibCheck (Nuxt's default) never checks, so they
// are reported apart from those at call sites. Any other error is counted too:
// a deep failure that silently degraded a type shows up there.
// Usage: node scripts/order-check.mjs <tsconfig> [filter-substring]
import ts from 'typescript'

const [, , project, filter = ''] = process.argv
const host = {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic: (d) => {
    throw new Error(String(d.messageText))
  },
}
const cfg = ts.getParsedCommandLineOfConfigFile(project, {}, host)
const roots = cfg.fileNames.filter(
  (f) => !f.endsWith('.d.ts') && f.includes(filter)
)
const deep = new Set([2321, 2589])
let worst = 0
for (const first of ['(tsc order)', ...roots]) {
  const program = ts.createProgram(cfg.fileNames, cfg.options)
  const order =
    first === '(tsc order)'
      ? program.getSourceFiles()
      : [program.getSourceFile(first), ...program.getSourceFiles()]
  const seen = new Set()
  const found = []
  let declDeep = 0
  let other = 0
  for (const sf of order) {
    if (!sf || seen.has(sf) || sf.isDeclarationFile) continue
    seen.add(sf)
    for (const d of program.getSemanticDiagnostics(sf)) {
      const at =
        d.file && d.start !== undefined
          ? d.file.getLineAndCharacterOfPosition(d.start).line + 1
          : '?'
      const where = `${d.file?.fileName.split('/').slice(-2).join('/')}:${at}`
      if (!deep.has(d.code)) {
        other++
        found.push(
          `TS${d.code} ${where} ${ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 100)}`
        )
      } else if (/\/lib\//.test(d.file?.fileName ?? '')) declDeep++
      else found.push(`TS${d.code} ${where}`)
    }
  }
  const callDeep = found.length - other
  worst = Math.max(worst, found.length)
  const name = first.split('/').slice(-2).join('/')
  console.log(
    `call-site deep ${callDeep}\tother errors ${other}\tlib-declaration deep ${declDeep}\tfirst=${name}${found.length ? `\n\t${[...new Set(found)].join('\n\t')}` : ''}`
  )
}
process.exitCode = worst === 0 ? 0 : 1
