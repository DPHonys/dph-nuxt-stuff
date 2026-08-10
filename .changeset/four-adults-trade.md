---
'@dphonys/nuxt-handler-errors': minor
---

Initial release. Declare a Nitro handler's expected failures once with `defineError` and `defineCheckedEventHandler`, and have every call site infer them from the route path alone: `useCheckedFetch`, `useCheckedAsyncData`, and `$checkedFetch` return typed success-or-failure results, and `matchError` handles failures with exhaustive arms. Includes server-to-server error propagation, request-aware fetching, and optional channel-gated responses via the `channelToken` module option.
