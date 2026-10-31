import process from 'node:process'
import { fileURLToPath } from 'node:url'
import NuxtModule from '../../../src/module'

// The native-engine fixture, prepared twice by
// `test/e2e/native-engine.test.ts`: once as an app on Nitro's route types,
// and, on Nuxt 4.6 and later, once with Nuxt's generated route engine, which
// is what `experimental.routeTypedFetch` turns on. Each lands in its own build
// directory, so both programs exist side by side. The module itself never
// reads the flag; only this app sets it.
const routeTypedFetch = process.env.NATIVE_FIXTURE_ENGINE === 'generated'

const config = defineNuxtConfig({
  modules: [NuxtModule],
  buildDir: routeTypedFetch ? '.nuxt/generated' : '.nuxt/internal-api',
  // A second handler on one route and method: Nitro's scan dedupes, the
  // config does not.
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

// Set only when on, so the app on Nitro's route types carries no key a Nuxt
// older than 4.6 does not know.
if (routeTypedFetch) config.experimental = { routeTypedFetch }

export default config
