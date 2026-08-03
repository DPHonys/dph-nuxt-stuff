# Nuxt Handler Errors

Declare a Nitro handler’s expected failures once and infer them at every call site from the route path.

<!-- TODO: Replace the Starter behavior and this documentation with package-specific behavior before publishing. -->

## Installation

Install the module with pnpm:

```sh
pnpm add @dphonys/nuxt-handler-errors
```

## Registration and configuration

Register the module and optionally configure its message in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-handler-errors'],
  handlerErrors: {
    message: 'A custom message',
  },
})
```

## Usage

The Starter behavior exposes the configured message through the
`$handlerErrors` Nuxt app injection:

```vue
<script setup lang="ts">
const { $handlerErrors } = useNuxtApp()
</script>

<template>
  <p>{{ $handlerErrors.message }}</p>
</template>
```

## Options

| Option    | Type     | Required | Description                          |
| --------- | -------- | -------- | ------------------------------------ |
| `message` | `string` | No       | Message exposed by `$handlerErrors`. |

## Repository development

From the repository root:

```sh
pnpm --filter @dphonys/nuxt-handler-errors dev
pnpm --filter @dphonys/nuxt-handler-errors typecheck
pnpm --filter @dphonys/nuxt-handler-errors test
pnpm --filter @dphonys/nuxt-handler-errors build
pnpm --filter @dphonys/nuxt-handler-errors publint
```

## License

Licensed under the [MIT License](./LICENSE).
