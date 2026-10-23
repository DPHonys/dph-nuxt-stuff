import { fileURLToPath } from 'node:url'

// PROTOTYPE (ticket 10). One app, two builds: ROUTE_TYPED_FETCH=1 writes
// `.nuxt-on` with Nuxt 4.6's generated engine, anything else `.nuxt-off`.
const on = process.env.ROUTE_TYPED_FETCH === '1'

export default defineNuxtConfig({
  buildDir: on ? '.nuxt-on' : '.nuxt-off',
  modules: ['../module/better-map'],
  experimental: { routeTypedFetch: on },
  compatibilityDate: 'latest',
  telemetry: false,
  // A second handler for (/api/multi, post): Nitro's scan dedupes, config does not.
  serverHandlers: [
    {
      route: '/api/multi',
      method: 'post',
      handler: fileURLToPath(
        new URL('./server/extra/multi-two.ts', import.meta.url)
      ),
    },
  ],
})
