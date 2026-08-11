---
"@dphonys/nuxt-handler-errors": minor
---

The channel-gating opt-out is now `channelToken: false` instead of `''` — the option types as `string | false`. An empty string still collapses to the opt-out, so existing configs keep working. (`null` was considered and rejected: the options merge treats it as unset and would silently restore the default token.)
