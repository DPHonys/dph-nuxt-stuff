# Better Handler

Declare a Nitro handler's request schemas, response schema and expected failures once, and get all of them typed at every call site.

<!-- TODO: Replace this placeholder with the package's usage documentation before publishing. -->

The package is under construction and private: it installs, takes its one option, and auto-imports `defineError` on the server. Nothing else is wired up yet.

## Compatibility

Every Nuxt 4 (`>=4.0.0 <5.0.0`).

CI holds that range at both edges. The default jobs install the committed lockfile, which pins the latest 4.x. On every push to `main` and every pull request into `main`, the `Nuxt 4.0 floor` job also runs this package's typecheck and tests with `nuxt`, `@nuxt/kit` and `@nuxt/schema` 4.0.x installed in their place, without changing the committed lockfile, and must pass.

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
