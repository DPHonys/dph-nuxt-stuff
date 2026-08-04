/**
 * Deliberately does not compile. Excluded from the package's `tsconfig` and
 * from lint (SPEC.md §9.9 trap 1); the harness compiles it alone with its own
 * `compilerOptions`.
 *
 * Asserted: `TS2345`, with a message that still **names the declared tags**.
 * That second half is the assertion that matters — it is the shape every real
 * `neg/` fixture in tickets 04–13 takes, and it is what would notice a compiler
 * bump that truncated the useful part of the message away (SPEC.md §9.2).
 */

declare function raise(tag: 'unauthorized' | 'user-not-found'): never

raise('forbidden')
