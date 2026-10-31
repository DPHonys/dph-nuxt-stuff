# One package

## What it replaces

Before this package, typed Nitro handlers in this repository took three packages: one for declared errors, one for request and response validation, and a third that composed the first two into one wrapper with its own fetch family. The first two existed mostly to serve the third, yet each was published, documented and versioned on its own.

That shape cost both sides:

- **The maintainer paid for overlap.** The two halves modelled several ideas twice: a Standard Schema check, a "plain object" test with two meanings under one name, a developer-mistake `500`, a declaration-time refusal, the brand on the handler type, a route lookup in the generated map, the module boilerplate. A fix had to land twice, and a release could need three packages to move together.
- **The composing package carried glue whose only job was bridging packages**: installing the other two, a writer for tsconfig `paths` so the app could resolve another package's types, a guard against registering a part beside the whole, warnings for config keys of the parts, re-export shims, and semi-public `internals/*` entries that had to be versioned as if they were API.
- **The reader paid for indirection.** Every rule lived in one of three READMEs, and the composing one linked to the others for depth.

The old composing package's name had also stopped describing it once it validated responses as well as requests.

`@dphonys/better-handler` is built fresh on one module. It keeps what earned its place, merges what was modelled twice into one implementation, and drops every piece of glue: nothing remains whose purpose was a package boundary. The old packages are deprecated and get no further releases.

## The shape that stayed

- **One module, one config key, one option.** `betterHandler: { devChecks }`. The module's setup is exactly what the feature needs: the option and its plugin, the server auto-imports, the composables and their plugins, and the type template.
- **Four public entries, frozen**: `.`, `/types`, `/server`, `/shared`. There is no `internals/*` surface to honour.
- **Side-first layout** (`module`, `build`, `runtime/server`, `runtime/app`, `runtime/shared`, `runtime/types`), as Nuxt's module builder requires, with `errors` and `io` as the second level within each side. The former validation half is called **io**, as it now covers the response too.
- **The word `better`** names everything the package owns: `defineBetterEventHandler`, the `useBetterFetch` family, `$betterFetch`, `BetterRequestOptions`, `betterHandler`. Names that are not about this package's flavour stay neutral: `defineError`, `recognizeKnownError`, `matchError`. No name is one that h3 v2 exports in lower case, since Nuxt 5 auto-imports every such export and an app would then see two.
- **Every Nuxt 4 from 4.0.0**, identically, with one additive layer on 4.6 (see [Request typing](./request-typing.md)). Nuxt 5 is a planned adapter behind named seams (see [Nuxt 5](./nuxt-5.md)).
