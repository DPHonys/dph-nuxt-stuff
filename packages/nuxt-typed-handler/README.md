# @dphonys/nuxt-typed-handler

Declare a Nitro handler's request schemas and expected failures once, and get
both typed at every call site. One module installed _instead of_
`@dphonys/nuxt-handler-errors` and `@dphonys/nuxt-handler-validation`.

Documentation lands with the package's first release.

## Repository development

From the repository root:

```sh
pnpm --filter @dphonys/nuxt-typed-handler dev
pnpm --filter @dphonys/nuxt-typed-handler typecheck
pnpm --filter @dphonys/nuxt-typed-handler test
pnpm --filter @dphonys/nuxt-typed-handler build
pnpm --filter @dphonys/nuxt-typed-handler publint
```

## License

Licensed under the [MIT License](./LICENSE).
