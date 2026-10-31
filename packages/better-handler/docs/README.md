# Design notes

Why `@dphonys/better-handler` is shaped the way it is. The [package README](../README.md) says what the package does and is the authority for its rules; [`INTERNALS.md`](../INTERNALS.md) says how it is built. These notes are interim, a placeholder for a documentation site, and record the reasoning that used to live in the READMEs of the three packages this one replaces and in the two design rounds behind it: the August 2026 composed design and the October 2026 consolidation spec.

- [One package](./one-package.md): why one module replaces three, and what it left behind.
- [The error model](./errors.md): tag-keyed declarations, `_tag`, one body for every caller, the Fail helper, the exhaustive union with `request-failed`, the fallback, development-only checks.
- [Input and output](./io.md): the Handler context as the only door, sources and tuples, the validation-failed wire, output as an assertion.
- [Request typing](./request-typing.md): input types, the generated map, the native slot, why both mechanisms exist, the stack-depth rules and the route ceiling.
- [Nuxt 5](./nuxt-5.md): the four seams the Nuxt 5 adapter replaces.
