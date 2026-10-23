import { fileURLToPath } from 'node:url'

// PROTOTYPE (ticket 10): the September 51-route program as a Nuxt app.
// ROUTE_TYPED_FETCH=1 selects the generated engine; GEN_ROUTES (written by
// scripts/cost.mjs) is how many synthetic routes server/api/gen holds.
const on = process.env.ROUTE_TYPED_FETCH === '1'
const gen = process.env.GEN_ROUTES ?? '45'

export default defineNuxtConfig({
  buildDir: `.nuxt-${on ? 'on' : 'off'}-${gen}`,
  modules: ['../module/better-map'],
  experimental: { routeTypedFetch: on },
  compatibilityDate: 'latest',
  telemetry: false,
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
