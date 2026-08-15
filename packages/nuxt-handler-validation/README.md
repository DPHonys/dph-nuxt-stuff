# Nuxt Handler Validation

Declare a Nitro handler's request schemas once and receive the validated, fully-typed values in the handler's second parameter.

<!-- TODO: Replace the Starter behavior and this documentation with package-specific behavior before publishing. -->

## Installation

Install the module with pnpm:

```sh
pnpm add @dphonys/nuxt-handler-validation
```

## Registration and configuration

Register the module and optionally configure its message in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-handler-validation'],
  handlerValidation: {
    message: 'A custom message',
  },
})
```

## Usage

The Starter behavior exposes the configured message through the
`$handlerValidation` Nuxt app injection:

```vue
<script setup lang="ts">
const { $handlerValidation } = useNuxtApp()
</script>

<template>
  <p>{{ $handlerValidation.message }}</p>
</template>
```

## Options

| Option    | Type     | Required | Description                              |
| --------- | -------- | -------- | ---------------------------------------- |
| `message` | `string` | No       | Message exposed by `$handlerValidation`. |

## Repository development

From the repository root:

```sh
pnpm --filter @dphonys/nuxt-handler-validation dev
pnpm --filter @dphonys/nuxt-handler-validation typecheck
pnpm --filter @dphonys/nuxt-handler-validation test
pnpm --filter @dphonys/nuxt-handler-validation build
pnpm --filter @dphonys/nuxt-handler-validation publint
```

## License

Licensed under the [MIT License](./LICENSE).
