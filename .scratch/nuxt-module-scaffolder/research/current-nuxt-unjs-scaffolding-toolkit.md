# Current Nuxt/UnJS scaffolding toolkit

Researched 2026-08-02 against official documentation and first-party source repositories.

## Recommendation

Use a deliberately small stack:

| Concern                            | Recommended API                                                                                         | Role and boundary                                                                                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Command shell                      | `citty`: `defineCommand`, `runMain`                                                                     | Own the root command, generated help, future arguments, and top-level error handling. Do not put prompts or generation logic in the command definition.              |
| Interactive flow                   | `@clack/prompts`: `intro`, `select`, `text`, `confirm`, `spinner`, `log`, `outro`, `isCancel`, `cancel` | Own the TUI, inline name validation, confirmation, progress, and explicit cancellation.                                                                              |
| Naming                             | `scule`: `kebabCase`, `camelCase`, `pascalCase`, `titleCase`                                            | Derive all names once from the validated canonical kebab-case package name.                                                                                          |
| Paths                              | `pathe`: `resolve`, `join`, `relative`, `basename`                                                      | Produce consistent slash-normalized paths across platforms.                                                                                                          |
| Local files                        | `node:fs/promises`: `cp`, `mkdir`, `readFile`, `writeFile`, `rename`, `rm`                              | Copy a repository-local template and manage a staging directory. No additional copying package is needed on the Nuxt 4 Node baseline.                                |
| `package.json` / `tsconfig.json`   | `pkg-types`: `readPackageJSON`, `writePackageJSON`, `sortPackage`; `readTSConfig`, `writeTSConfig`      | Parse, type, mutate, and write JSON-shaped project metadata.                                                                                                         |
| JavaScript/TypeScript config       | `magicast`: `loadFile`, `writeFile`, proxied default export/function arguments                          | Structurally set the generated module's static `defineNuxtModule({...})` metadata. It is not the general template renderer and should not edit JSON.                 |
| Install                            | `nypm`: `detectPackageManager`, `installDependencies`                                                   | Detect the repository manager from `packageManager`/lockfiles and run the root install. For this repository, verify the result is `pnpm` and run at repository root. |
| General logging                    | Clack `log` and `spinner` inside this short guided flow                                                 | Keeps one coherent TUI. Add `consola` only if the tool later needs reusable non-interactive/scoped/reportable logging.                                               |
| Abortable child process, if needed | `tinyexec`: `x(command, args, { signal, nodeOptions })`                                                 | Optional escape hatch when install output streaming or managed `AbortSignal` cancellation is required; `nypm`'s public operation options do not expose either.       |

This closely follows the current first-party `create-nuxt` stack: its package metadata includes Clack, Citty, Giget, nypm, Pathe, pkg-types, std-env, and tinyexec, while its implementation composes Citty with direct Clack prompts, explicit `isCancel` checks, nypm detection/command generation, and filesystem operations. ([create-nuxt package](https://github.com/nuxt/cli/blob/main/packages/create-nuxt/package.json), [create-nuxt implementation](https://github.com/nuxt/cli/blob/main/packages/create-nuxt/src/init.ts))

## APIs and limitations

### Citty is the shell, not the wizard

`defineCommand` supplies a typed command definition; `runMain` adds built-in help/version handling and catches failures. Citty also supports async/lazy subcommands, so the single initial `nuxt-module` registry entry can later grow without changing the entrypoint. `runMain` prints caught errors and exits the process, while `runCommand` is the lower-level API that returns a result and always invokes command/plugin cleanup hooks; keep the core scaffold operation independently callable for tests rather than testing through process exit. ([Citty docs](https://unjs.io/packages/citty/), [`runMain` source](https://github.com/unjs/citty/blob/main/src/main.ts), [`runCommand` source](https://github.com/unjs/citty/blob/main/src/command.ts))

The initial product is interactive-only, but Citty still earns its place as the stable executable boundary. A minimal command should have metadata and a `run` method which invokes an injected `promptForRequest()` followed by `scaffold(request)`; it need not expose name/kind flags yet.

### Use Clack directly for prompts and cancellation

Direct `@clack/prompts` is preferable to `consola.prompt` here. Clack's `text` prompt has a `validate` callback, its `select` values are generic, and every prompt can be checked with `isCancel`. Current `create-nuxt` uses precisely the pattern `const result = await ...; if (isCancel(result)) { cancel('Operation cancelled.'); process.exit(1) }`. ([Clack prompts](https://github.com/bombshell-dev/clack/tree/main/packages/prompts), [create-nuxt cancellation handling](https://github.com/nuxt/cli/blob/main/packages/create-nuxt/src/init.ts))

Wrap that repeated check in one local helper and perform every prompt, including final confirmation, before the first filesystem write. Cancellation before confirmation then has no cleanup burden. During post-generation install, report interruption/failure without removing the generated package: generation has already committed, and the printed recovery command is `pnpm install`.

Consola remains a good UnJS logger and offers `info`, `warn`, `success`, tagged instances, reporters, and a Clack-powered `prompt` wrapper. The wrapper is intentionally narrower, however: it supports text/confirm/select/multiselect with string select values and configurable cancellation modes, but does not expose Clack's text validator. Mixing Consola output with Clack's guided layout adds little for this small tool, so prefer Clack `log`/`spinner` initially. ([Consola docs](https://unjs.io/packages/consola/), [`consola.prompt` source](https://github.com/unjs/consola/blob/main/src/prompt.ts))

### Derive names once with Scule

After validating that input is canonical kebab case, build one immutable naming context, for example:

```text
{
  slug: kebabCase(input),
  packageName: `@dphonys/${kebabCase(input)}`,
  configKey: camelCase(input),
  pascalName: pascalCase(input, { normalize: true }),
  displayName: titleCase(input),
}
```

Scule documents the relevant case conversions and warns that Pascal/camel conversion preserves uppercase runs unless `normalize: true`; using normalization makes derived identifiers deterministic. `kebabCase` lowercases its result. Validation, not silent normalization, should reject empty values, scoped names, path separators, dots, leading/trailing dashes, and any input for which `kebabCase(input) !== input`. ([Scule docs](https://github.com/unjs/scule#utils))

### Pathe plus native filesystem APIs for a local template

Pathe is a drop-in-style path utility whose operations normalize separators to `/`, preventing template registry behavior from differing between Windows and POSIX. Use it for calculating the repository root, source, destination, staging, and user-facing relative paths. ([Pathe docs](https://github.com/unjs/pathe#readme))

Use native `node:fs/promises.cp(source, staging, { recursive: true, force: false, errorOnExist: true })` for this repository-local template; it copies directory contents, including dotfiles, without a network/cache abstraction. Native `rename` can then commit the fully rendered staging directory to `packages/<slug>`. ([Node `fsPromises.cp`](https://nodejs.org/api/fs.html#fspromisescpsrc-dest-options))

Do not add Giget for version one. Giget is excellent for provider/registry URLs, tarball extraction, offline download caching, and remote Git repositories—the reason current `create-nuxt` uses it—but those capabilities are unnecessary for a template checked into the same repository. It also exposes destructive `force`/`forceClean` behavior that conflicts with the agreed refuse-to-overwrite rule. Add it only if templates later become remote. ([Giget docs](https://github.com/unjs/giget#readme))

### Separate JSON mutation, TypeScript mutation, and text rendering

Use `pkg-types` for `package.json`: read the copied file, assign the canonical package name and description, run `sortPackage`, then `writePackageJSON`. It supplies typed package metadata, package/lockfile/workspace discovery, stable sorting, and matching TSConfig APIs. Its newer `updatePackage` also handles JSON/JSON5/YAML, but explicit read/mutate/write is clearer for a known generated file. ([pkg-types docs](https://github.com/unjs/pkg-types#package-configuration))

Use Magicast only where structure matters, initially `src/module.ts`: load the file, obtain the first argument of the default-exported `defineNuxtModule(...)` function call, and assign `meta.name` and `meta.configKey`, then write it. `loadFile`/`writeFile` are filesystem-backed; `parseModule`/`generateCode` are the in-memory alternatives. Magicast's `addNuxtModule` helper is for adding a module to a consumer's Nuxt config, not creating a module package, and its high-level helpers are explicitly experimental. ([Magicast docs](https://unjs.io/packages/magicast/), [`addNuxtModule` source](https://github.com/unjs/magicast/blob/main/src/helpers/nuxt.ts), [file API source](https://github.com/unjs/magicast/blob/main/src/file.ts))

Magicast explicitly cannot model all dynamic JavaScript and recommends defensive `try/catch` around mutations. Treat an unexpected AST shape as a template invariant failure, abort while still in staging, and show the failing file; do not fall back to an unsafe regex rewrite. It also is not a general renderer: replace a small, enumerated set of unambiguous tokens in prose and other plain-text files, assert that no known token remains, and let Magicast/pkg-types own structured files. ([Magicast limitations](https://github.com/unjs/magicast#notes))

### Let nypm choose and run the repository package manager

`detectPackageManager(cwd)` checks `packageManager`, then `devEngines.packageManager`, then known lock/marker files. `installDependencies({ cwd })` resolves the manager, optionally integrates Corepack for pnpm/yarn, runs `install`, and throws on a non-zero exit. Its default search includes parent directories, so pass the repository root deliberately and assert `detected.name === 'pnpm'` before running the agreed root install. ([nypm docs](https://unjs.io/packages/nypm/), [detection source](https://github.com/unjs/nypm/blob/main/src/package-manager.ts), [operation source](https://github.com/unjs/nypm/blob/main/src/api.ts))

The public nypm operation options currently include `cwd`, `env`, `silent`, `packageManager`, `corepack`, and `dry`, but not `AbortSignal` or an output callback. With the normal non-silent install, stdio is inherited in a TTY. If the UI must keep an active spinner, stream output, and reliably terminate the child tree on cancellation, follow Nuxt CLI's more involved approach: ask nypm for the command with `dry: true`, then execute it through an abort-aware process layer. Tinyexec supports `signal`, async output iteration, `kill`, and explicit exit-code handling; Nuxt's own install helper uses nypm for command semantics and a custom abortable runner for stronger process-tree cleanup. ([nypm option types](https://github.com/unjs/nypm/blob/main/src/types.ts), [nypm execution source](https://github.com/unjs/nypm/blob/main/src/_utils.ts), [tinyexec docs](https://github.com/tinylibs/tinyexec#readme), [Nuxt install helper](https://github.com/nuxt/cli/blob/main/packages/nuxt-cli/src/utils/install.ts))

For version one, prefer the simpler direct `installDependencies({ cwd: repoRoot, packageManager: detected })`, show a non-animated Clack step while its inherited output is active, catch failure, retain the valid generated package, set a failing exit code, and print `pnpm install` as recovery. A bespoke Nuxt-grade process-tree controller is not justified unless cancellable/spinner-contained installs become an explicit acceptance requirement.

## Proposed orchestration

1. Citty enters the single root command.
2. Clack gathers template kind, canonical name, optional description, and final confirmation; every response passes through the cancellation helper.
3. Scule creates the naming context once.
4. Pathe resolves `templates/nuxt-module`, a same-filesystem temporary sibling under `packages/`, and final `packages/<slug>`; refuse an existing destination.
5. Native `cp` copies into staging.
6. Plain token rendering handles documentation and other unstructured text; pkg-types edits JSON; Magicast edits the known TypeScript AST shape.
7. Validate that expected files exist and no template tokens remain, then atomically rename staging to the destination. Remove only that verified staging directory on pre-commit failure.
8. nypm runs the repository-root install. Run the repository's formatter afterward using the same package-manager/script mechanism or its existing command contract.
9. Clack prints success and the exact development/test commands; install/format failure leaves the generated package in place and prints recovery steps.

This preserves an extensible registry at the application boundary while keeping each library in the domain it actually supports.
