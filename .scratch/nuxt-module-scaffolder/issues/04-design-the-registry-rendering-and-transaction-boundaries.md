# Design the registry, rendering, and transaction boundaries

Type: prototype
Status: resolved
Blocked by: 01, 02, 03

## Question

What interfaces should separate the command shell, interactive flow, template registry, Nuxt-module template definition, static file copying, token substitution, Magicast-backed structured mutations, validation, `pnpm install`, formatting, and rollback so that the first template is simple while a second local template kind can be added without changing the core workflow?

Resolve collision policy, temporary staging, partial-failure cleanup, process exit behavior, test seams, and the boundary between declarative template metadata and imperative hooks.

## Comments

- Prototype captured on branch `prototype/registry-rendering-transaction-boundaries` at commit `b41247c` (`pnpm prototype:scaffold-boundaries`). It simulates the proposed Scaffolder-owned transaction across collision, staging, declarative rendering, validation, commit, cleanup failure, install/format failure, interruption, retention, recovery commands, and exit codes without touching the filesystem. Input works with raw terminal keys and line/chunk-based terminal wrappers.
- Human verdict: approved; the single-key controls are understood to belong only to the diagnostic prototype, while the production Clack prompts retain normal Enter/confirmation behavior.

## Answer

Use one deep Scaffolder module whose production interface is:

```ts
runScaffolder({ repositoryRoot, signal? }): Promise<ScaffoldOutcome>
```

The Citty command is only the executable shell: it calls this interface, renders the returned outcome, and assigns `process.exitCode`. It contains no prompts, naming, registry lookup, rendering, cleanup, install, formatting, or recovery policy, and neither the Scaffolder nor its dependencies call `process.exit()`.

Internally, compose the Scaffolder with a Clack interaction adapter, a repository-owned template registry, an installer, and a formatter. Production exports only the deep interface; tests may use a private composition factory with scripted interaction and fake post-commit effects.

The registry is a static collection of pure template definitions. Each definition declares its template-kind id and label, repository-relative source directory, expected files, allowed text tokens, and a pure `prepare(input)` function. `prepare` derives one frozen naming context and returns an immutable, path-confined render/validation plan. The initial plan vocabulary is deliberately small:

- Copy the template tree.
- Replace allowlisted tokens in explicitly declared plain-text files.
- Write JSON-shaped metadata through pkg-types.
- Apply a named, narrowly scoped Magicast recipe to a known TypeScript file and fail on an unexpected AST shape.
- Run declarative required-file, unresolved-token, metadata, and template-specific validations.

No arbitrary imperative template hook is included in version one. Operation adapters own the powerful implementation dependencies; templates select operations and supply data but cannot delete, commit, install, format, report success, or set exit state. A second repository-local template kind adds another definition and reuses this workflow. A genuinely new mutation capability adds one named operation adapter without changing transaction order.

After the approved prompt/review flow returns a confirmed request, the Scaffolder owns this fixed lifecycle:

1. Recheck the destination and acquire a destination-specific cooperative lock with exclusive creation.
2. Exclusively create a unique same-filesystem sibling such as `packages/.scaffold-<name>-<nonce>` and retain its exact path as an owned-staging handle.
3. Copy, execute the prepared render plan, and validate entirely in staging.
4. Recheck the destination, then rename staging to `packages/<name>`. The rename is the commit point.
5. Release the lock, run repository-root `pnpm install`, then run `pnpm exec oxfmt packages/<name>`.

Name-prompt validation refuses an existing destination before confirmation; the later checks cover changes during the interaction. The cooperative lock prevents two Scaffolder processes from targeting the same name. Node has no portable atomic no-clobber directory rename, so an unrelated external writer that ignores the lock during the final check/rename interval is explicitly outside the concurrency guarantee; the Scaffolder never deliberately merges with or removes an existing destination.

Before commit, any failure or interruption removes only the exact staging and lock artifacts owned by that invocation. Cleanup never accepts a caller-supplied path, glob, discovered directory, generated-package destination, or repository root. If cleanup itself fails, return the original error plus the exact retained artifact path and manual-removal guidance. After commit, rollback is forbidden: installation, formatting, interruption, or lock-release failure retains the generated package and reports recovery.

Return a discriminated `ScaffoldOutcome` covering created, declined/cancelled, collision, generation failure, cleanup failure, install failure, format failure, and interruption before/after commit. Intentional decline or prompt cancellation exits `0`; success exits `0`; operational failure exits `1`; signal interruption after confirmation exits `130`. Installation failure prescribes `pnpm install` then formatting; formatting failure prescribes formatting then the package test; post-commit interruption conservatively prescribes installation then formatting.

The interface is the primary test surface. Exercise interaction with a scripted adapter, install/format with recording and failing adapters, and transaction semantics against real temporary repositories so directory creation, collision, cleanup, and rename are real. Assert returned outcomes, terminal messages, command order, destination contents/absence, staging cleanup, and post-commit retention. Pure plan preparation and named renderer recipes may also be tested directly against template fixtures, but library-shaped wrappers are not public seams.

Version one needs no separate template-authoring guide. The internal types and invariants plus the Nuxt-module definition are the authoring contract until a second real template kind demonstrates a documentation need.
