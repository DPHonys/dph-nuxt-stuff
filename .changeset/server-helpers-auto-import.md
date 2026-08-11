---
'@dphonys/nuxt-handler-errors': minor
---

The four server helpers — `defineCheckedEventHandler`, `defineError`, `payload`, and `recognizeKnownError` — are now auto-imported in the Nitro build, the same ambient position `defineEventHandler` holds. The `/server` subpath export is unchanged and remains the explicit door for code that auto-imports cannot reach (`shared/`, `imports.autoImport: false`). `defineError` was checked against h3, Nitro, and Nuxt before claiming the global name; none of them export it.
