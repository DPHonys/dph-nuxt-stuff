import { defineNuxtModule } from '@nuxt/kit'

export default defineNuxtModule({
  meta: {
    name: 'nuxt-handler-errors',
    configKey: 'handlerErrors',
    // The ceiling is load-bearing: `compatibility.nuxt` is checked at module
    // setup, before any dependency or type machinery matters, so it is the only
    // guard against the h3 v2 / Nitro 3 line. The floor is what was measured
    // (4.5.1) rather than what the scaffold assumed. See SPEC.md §7.1.
    compatibility: { nuxt: '>=4.5.0 <5.0.0' },
  },
})
