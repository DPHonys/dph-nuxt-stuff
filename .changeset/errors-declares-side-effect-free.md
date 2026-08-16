---
'@dphonys/nuxt-handler-errors': patch
---

The package now declares `sideEffects: false`. Nothing in the runtime tree runs
at import time — the plugins, composables, and server helpers are all consumed
through their exports — so a consumer's bundler may drop whatever an app does
not reach. Previously the absence of the field forced every runtime file that
was imported to be kept whole.
