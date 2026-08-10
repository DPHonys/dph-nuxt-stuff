/**
 * Ambient declarations for the harness's own self-test.
 *
 * Nothing imports this file, which is the whole point. It reaches a fixture
 * program only because `tsconfig.fixtures.json` lists it and `compileAlone`
 * seeds `createProgram` with `parsed.fileNames` as well as the fixture. Drop
 * that and `pos/harness-clean.ts` stops compiling clean — which is how the
 * suite notices it has gone back to compiling fixtures in isolation from the
 * declarations they need.
 *
 * The generated `.nuxt/types/*.d.ts` augmentations later tickets assert against
 * arrive by exactly this route.
 */
declare namespace HarnessSelfTest {
  /** Resolvable only when the ambient half of the program is present. */
  interface AmbientProbe {
    readonly reachedTheWholeProgram: true
  }
}
