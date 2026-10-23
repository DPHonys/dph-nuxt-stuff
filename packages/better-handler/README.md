# Better Handler

Declare a Nitro handler's request schemas, response schema and expected failures once, and get all of them typed at every call site.

<!-- TODO: Replace this placeholder with the package's usage documentation before publishing. -->

The package is under construction and private: it installs, takes its one option, and does nothing else yet.

## Compatibility

Every Nuxt 4 (`>=4.0.0 <5.0.0`).

## Registration and configuration

```ts
export default defineNuxtConfig({
  modules: ['@dphonys/better-handler'],
  betterHandler: {
    devChecks: true,
  },
})
```

## Options

| Option      | Type      | Default | Description                                                                                                                                                                                                       |
| ----------- | --------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `devChecks` | `boolean` | `true`  | Whether a development server asserts a response against the route's `output`, a thrown Known error's fields against its schema, and refuses a thrown `_tag` the route never declared. Production never runs them. |

## Repository development

From the repository root:

```sh
pnpm --filter @dphonys/better-handler dev
pnpm --filter @dphonys/better-handler typecheck
pnpm --filter @dphonys/better-handler test
pnpm --filter @dphonys/better-handler build
pnpm --filter @dphonys/better-handler publint
```

## License

Licensed under the [MIT License](./LICENSE).
