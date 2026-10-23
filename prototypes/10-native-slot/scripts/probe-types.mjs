// PROTOTYPE (ticket 10). Prints every exported type alias of one file as the
// checker of the given project resolves it, then that file's diagnostics.
// Usage: node scripts/probe-types.mjs <tsconfig> <file>
import ts from 'typescript'
const [, , project, file] = process.argv
const cfg = ts.getParsedCommandLineOfConfigFile(
  project,
  {},
  {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (d) => {
      throw new Error(String(d.messageText))
    },
  }
)
const program = ts.createProgram([...cfg.fileNames, file], cfg.options)
const checker = program.getTypeChecker()
const sf = program.getSourceFile(file)
for (const s of sf.statements) {
  if (
    ts.isTypeAliasDeclaration(s) &&
    s.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  ) {
    const t = checker.getDeclaredTypeOfSymbol(
      checker.getSymbolAtLocation(s.name)
    )
    console.log(
      `${s.name.text} = ${checker.typeToString(t, s, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.InTypeAlias)}`
    )
  }
}
const diags = ts.getPreEmitDiagnostics(program, sf)
for (const d of diags) {
  const at =
    d.file && d.start !== undefined
      ? d.file.getLineAndCharacterOfPosition(d.start)
      : undefined
  console.log(
    'DIAG',
    `${d.file ? d.file.fileName.split('/').slice(-2).join('/') : ''}:${at ? at.line + 1 : ''}`,
    `TS${d.code}`,
    ts.flattenDiagnosticMessageText(d.messageText, ' ').slice(0, 160)
  )
}
