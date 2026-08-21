import ts from 'typescript'
const cfg = ts.parseJsonConfigFileContent(ts.readConfigFile('tsconfig.json', ts.sys.readFile).config, ts.sys, '.')
const p = ts.createProgram(cfg.fileNames, cfg.options); const c = p.getTypeChecker()
const sf = p.getSourceFile(process.argv[2]); 
for (const s of sf.statements) if (ts.isTypeAliasDeclaration(s)) console.log(s.name.text, '=', c.typeToString(c.getDeclaredTypeOfSymbol(c.getSymbolAtLocation(s.name)), s, ts.TypeFormatFlags.NoTruncation|ts.TypeFormatFlags.InTypeAlias))
