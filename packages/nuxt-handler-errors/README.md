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

## Channel gating

Set a channel token and responses to callers that are **not your app** go out
with the known-error marker stripped: third parties get an ordinary error
response, while your own calls — browser and SSR alike — get the full wire.

```ts
export default defineNuxtConfig({
  modules: ['@dphonys/nuxt-handler-errors'],
  runtimeConfig: {
    public: {
      handlerErrors: {
        // or leave it empty here and set
        // NUXT_PUBLIC_HANDLER_ERRORS_CHANNEL_TOKEN at run time
        channelToken: 'my-app',
      },
    },
  },
})
```

Every fetch surface of this module (`$checkedFetch` and `.try`,
`event.$checkedFetch`, `useCheckedFetch` and its lazy twin) then sends the token
as the `x-known-error-channel` request header, and a Nitro error-handler entry
strips the marker from the response body of any request that did not carry it.

- **The token is a channel tag, not a secret.** It rides `runtimeConfig.public`
  because the browser must send it too, so it ships in the client bundle and is
  visible in devtools. It marks first-party intent; it authorises nothing, and
  nothing that matters may be gated on it.
- Gating is enabled by the token's presence. With no token configured, nothing
  is attached and nothing is stripped.
- **The thrown error always carries the marker** — only the serialized response
  is ever stripped, so observability sees known failures identically no matter
  who called.

## Observability

`recognizeKnownError` answers the variant an error carries, or `undefined`, at
both marker depths — the route's own thrown error and a fetched carrier from a
server-to-server call. This module suppresses nothing; what reaches your tracker
is your one-line choice:

```ts
import { recognizeKnownError } from '@dphonys/nuxt-handler-errors/server'

// server/plugins/observability.ts
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('error', (error) => {
    // A route's own declared failure: expected, not a bug.
    if (recognizeKnownError(error) && error.unhandled === false) return

    report(error)
  })
})
```

The same predicate works in Sentry's `beforeSend` over
`hint.originalException`. The `unhandled === false` half is load-bearing: a
declared failure that **escaped** an inner handler reaches the hook carrying a
marker too, and that one is a caller bug that must keep reporting.

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
