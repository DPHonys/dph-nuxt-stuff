// PROTOTYPE (ticket 10). The lib/*.d.ts declarations checked on their own
// (skipLibCheck off for them alone), inside a fixture app's program so the
// InternalApi map is populated: question 1 (c), the slot satisfies h3's
// `EventHandler<Request extends EventHandlerRequest>` at the declaration.
// Usage: node scripts/lib-check.mjs <tsconfig>
import ts from 'typescript'

const [, , project] = process.argv
const host = {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic: (d) => {
    throw new Error(String(d.messageText))
  },
}
const cfg = ts.getParsedCommandLineOfConfigFile(
  project,
  { skipLibCheck: false },
  host
)
const program = ts.createProgram(cfg.fileNames, {
  ...cfg.options,
  skipLibCheck: false,
})
const lib = program
  .getSourceFiles()
  .filter((sf) =>
    /\/prototypes\/10-native-slot\/lib\/[^/]+\.d\.ts$/.test(sf.fileName)
  )
let count = 0
for (const sf of lib) {
  const diags = program.getSemanticDiagnostics(sf)
  count += diags.length
  console.log(
    `${diags.length === 0 ? 'clean' : `${diags.length} errors`}\t${sf.fileName.split('/').slice(-2).join('/')}`
  )
  for (const d of diags)
    console.log(
      `\tTS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 160)}`
    )
}
process.exitCode = count === 0 ? 0 : 1
