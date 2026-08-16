---
'@dphonys/nuxt-handler-validation': patch
---

The package now declares `sideEffects: false`. Nothing in the runtime tree runs
at import time — the handler factory, the source and issue helpers, and the
shared error marker are all consumed through their exports — so a consumer's
bundler may drop whatever an app does not reach. Previously the absence of the
field forced every runtime file that was imported to be kept whole.
