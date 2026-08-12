# Nuxt Handler Validation

Declare a Nitro handler's request schemas once, and get the validated,
fully-typed values in the handler's second parameter - query, body, route
params and headers, validated via any [Standard Schema](https://standardschema.dev)
library _before_ the handler body runs. Failures answer with one stable,
documented wire shape, identical in dev and prod.

> **Under construction.** The package is scaffolded and its entries are wired;
> the runtime surface is being built. Documentation lands with it.

## License

[MIT](./LICENSE)
