# Define verification and acceptance

Type: grilling
Status: resolved
Blocked by: 03, 04, 05

## Question

Which automated tests, generated-fixture checks, failure-path tests, repository checks, and manual acceptance scenarios are sufficient to make the resulting implementation specification executable without further design decisions?

The answer must define observable acceptance criteria for the interactive UX, file output, naming derivations, working example, install/format lifecycle, non-overwrite guarantee, and Nuxt 4 compatibility.

## Answer

Verification has four automated layers and one one-time manual handoff. Every automated layer is mandatory in the canonical `pnpm check` gate on each pull request and before release; there is no optional, nightly, or numeric coverage gate.

### Root gate

Add a focused root Vitest command for the Scaffolder and make the root `test` script run it once before `turbo run test`. The root `check` command remains the sequence decided in [Specify the generated module and repository contract](05-specify-the-generated-module-and-repository-contract.md): type checking, formatting, linting, tests, builds, and `publint`. CI and release run that same command under Node 26, so there is one definition of acceptance.

Scaffolder tests exercise the deep `runScaffolder` interface or the private composition factory approved in [Design the registry, rendering, and transaction boundaries](04-design-the-registry-rendering-and-transaction-boundaries.md). They do not test through `process.exit`, mock filesystem-shaped wrappers, or expose new production seams solely for tests.

### Pure contract tests

Use table-driven tests for name validation and the frozen naming context.

- Accept a one-letter name, an 80-character name, ordinary multiword names, and embedded digits.
- Reject empty and whitespace-only input, more than 80 characters, uppercase letters, spaces, underscores, dots, path separators, scoped names, Unicode, repeated/leading/trailing hyphens, and a leading digit.
- Assert the exact validation messages approved in [Prototype the interactive scaffolding contract](03-prototype-the-interactive-contract.md).
- Use `api-2-client` as the canonical derivation case and assert every value in the naming table from [Specify the generated module and repository contract](05-specify-the-generated-module-and-repository-contract.md), including `$api2Client` and `Hello from Api 2 Client`.

Test registry lookup, immutable plan preparation, path confinement, the allowlisted token renderer, pkg-types metadata writing, each named Magicast recipe, required-file checks, unresolved-token rejection, unexpected-AST rejection, and template-specific validation directly. Include both a trimmed non-empty description and a blank description; blank must remove optional manifest/documentation content rather than render invented copy. Fix the injected clock in tests and assert the rendered license year.

### Scripted interaction and outcome tests

Use the scripted interaction adapter to assert semantic events and the exact approved user-facing copy. Do not snapshot Clack ANSI output.

Cover the prompt order, the preselected Nuxt-module kind, lack of a name default, blank description default, inline retry after every validation class and collision, every review row, default-No confirmation, and the rule that no filesystem or post-commit adapter is touched before confirmation. Decline and cancellation before confirmation return the intentional no-change message and exit `0`.

For confirmed requests, assert the ordered rendering/validation, install, and formatting steps; exact success and recovery messages; returned outcome; and exit code. The command shell must translate outcomes to exit codes without calling `process.exit()`: success/decline/cancellation are `0`, operational failures are `1`, and signal interruption after confirmation is `130`.

### Real-filesystem transaction and failure tests

Run transaction tests in real temporary repositories while scripting interaction and recording or failing the install/format adapters. Assert destination contents or absence, owned staging/lock cleanup, post-commit retention, adapter arguments, repository-root working directory, and call order.

The matrix must include:

- Successful exclusive lock, staging, validation, atomic commit, lock release, install, then destination-scoped formatting.
- An existing destination represented by a directory, regular file, or symlink; none may be overwritten, merged into, followed, or removed.
- A destination appearing after review and a destination appearing before commit; both return collision and preserve the unrelated destination.
- Deterministic same-name contention by holding the real cooperative lock and proving that a second invocation cannot touch the destination. Do not use timing-sensitive process races.
- Failure in copy, token rendering, JSON mutation, Magicast mutation, or validation before commit; the destination remains absent and only the invocation's exact staging and lock artifacts are removed.
- Cleanup failure; retain and report the exact owned artifact path alongside the original failure and manual-removal guidance.
- Lock-release, install, or format failure after commit; retain the generated package, do not roll it back, and emit the already-approved recovery commands. Formatting is not attempted after install failure.
- Interruption before commit; clean owned artifacts and leave no destination. Interruption after commit; retain the destination and conservatively prescribe install then formatting.

The unrelated writer that ignores the cooperative lock inside the documented final check/rename interval remains outside the guarantee and is not represented as a passing concurrency case.

### Disposable acceptance fixture

On every `pnpm check`, create one acceptance fixture named `api-2-client` in a disposable repository using the production Nuxt-module definition, renderers, validators, transaction, installer, and formatter. Use a whitespace-padded non-empty description and a fixed year. Run the real repository-root `pnpm install --no-frozen-lockfile` in the disposable repository, so its lockfile—not the working repository's—is the only lockfile changed.

Before installation, assert the exact generated tree and the absence of every file ruled out by [Specify the generated module and repository contract](05-specify-the-generated-module-and-repository-contract.md). Assert all derived names and manifest fields, trimmed description, scripts, dependency roles, Nuxt compatibility metadata, README sections, exactly three handoff markers, the fixed license year, and the absence of all known template tokens, staging directories, and lock artifacts. These are targeted structural and semantic assertions, not a full-file golden snapshot.

After the real install and production formatting step:

- Run Oxfmt in check mode over the generated package.
- Run its lint, typecheck, test, build, playground build, and `publint` commands successfully.
- Let the generated `@nuxt/test-utils/e2e` test start the consumer fixture, fetch `/`, and assert the distinct configured message. This is the real SSR proof of module option flow, plugin registration, runtime injection, and the derived injection name.
- Build the playground against the workspace package and assert its source uses the default message and display name, proving the checked-in working example is both rendered and compilable.
- Verify Turbo and pnpm discover the generated package and nested playground workspace through the actual repository support rather than invoking tools against an unregistered directory.

The acceptance fixture uses the catalog's pinned current Nuxt 4 release. Also assert that generated module metadata declares the exact agreed `>=4.0.0` compatibility range; do not add a second Nuxt 4.0.0 dependency-install matrix.

Always remove the disposable repository in test teardown, including after failure. Do not commit an expected generated package: the exact-tree and semantic assertions supply the contract without maintaining a second copy of the Template.

### One-time manual acceptance

Run these scenarios in a throwaway worktree on Node 26 when handing off the implementation. They validate only real-terminal behavior that would be brittle as ANSI snapshots.

1. Run `pnpm scaffold`, enter an invalid name, correct it, leave description blank, inspect the review, and press Enter at the default-No confirmation. Confirm normal keyboard behavior, readable inline validation, the exact no-change message, exit `0`, and an unchanged worktree.
2. Run again, accept creation, and confirm the three lifecycle steps appear in order followed by the exact success and next-step output. Run the printed package test command successfully.
3. Run again with a fresh name, press Ctrl-C during prompting, and confirm readable cancellation, exit `0`, and no filesystem change.

Install/format failures, collision timing, signal timing after confirmation, and cleanup are not manually induced; the deterministic automated matrix is their acceptance authority.
