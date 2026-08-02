# SCAFFOLD_DISPLAY_NAME_TOKEN

SCAFFOLD_DESCRIPTION_TOKEN<!-- TODO: Replace the Starter behavior and this documentation with package-specific behavior before publishing. -->

## Installation

Install the module with pnpm:

```sh
pnpm add SCAFFOLD_PACKAGE_NAME_TOKEN
```

## Registration and configuration

Register the module and optionally configure its message in `nuxt.config.ts`:

```ts
export default defineNuxtConfig({
  modules: ['SCAFFOLD_PACKAGE_NAME_TOKEN'],
  SCAFFOLD_CONFIG_KEY_TOKEN: {
    message: 'A custom message',
  },
})
```

## Usage

The Starter behavior exposes the configured message through the
`SCAFFOLD_RUNTIME_INJECTION_TOKEN` Nuxt app injection:

```vue
<script setup lang="ts">
const { SCAFFOLD_RUNTIME_INJECTION_TOKEN } = useNuxtApp()
</script>

<template>
  <p>{{ SCAFFOLD_RUNTIME_INJECTION_TOKEN.message }}</p>
</template>
```

## Options

| Option    | Type     | Required | Description                                            |
| --------- | -------- | -------- | ------------------------------------------------------ |
| `message` | `string` | No       | Message exposed by `SCAFFOLD_RUNTIME_INJECTION_TOKEN`. |

## Repository development

From the repository root:

```sh
pnpm --filter SCAFFOLD_PACKAGE_NAME_TOKEN dev
pnpm --filter SCAFFOLD_PACKAGE_NAME_TOKEN typecheck
pnpm --filter SCAFFOLD_PACKAGE_NAME_TOKEN test
pnpm --filter SCAFFOLD_PACKAGE_NAME_TOKEN build
pnpm --filter SCAFFOLD_PACKAGE_NAME_TOKEN publint
```

## License

Licensed under the [MIT License](./LICENSE).
