# @dphonys/nuxt-handler-errors

## 0.3.0

### Minor Changes

- The four server helpers — `defineCheckedEventHandler`, `defineError`, `payload`, and `recognizeKnownError` — are now auto-imported in the Nitro build, the same ambient position `defineEventHandler` holds. The `/server` subpath export is unchanged and remains the explicit door for code that auto-imports cannot reach (`shared/`, `imports.autoImport: false`). `defineError` was checked against h3, Nitro, and Nuxt before claiming the global name; none of them export it.

## 0.2.0

### Minor Changes

- The channel-gating opt-out is now `channelToken: false` instead of `''` — the option types as `string | false`. An empty string still collapses to the opt-out, so existing configs keep working, but it now warns at build time and suggests `false`. (`null` was considered and rejected: the options merge treats it as unset and would silently restore the default token.)

## 0.1.0

### Minor Changes

- Initial release. Declare a Nitro handler's expected failures once with `defineError` and `defineCheckedEventHandler`, and have every call site infer them from the route path alone: `useCheckedFetch`, `useCheckedAsyncData`, and `$checkedFetch` return typed success-or-failure results, and `matchError` handles failures with exhaustive arms. Includes server-to-server error propagation, request-aware fetching, and optional channel-gated responses via the `channelToken` module option.
