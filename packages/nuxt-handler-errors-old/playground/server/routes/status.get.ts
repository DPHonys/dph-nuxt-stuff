import {
  defineErrors,
  defineTypedEventHandler,
  payload,
} from '@dphonys/nuxt-handler-errors-old/server'

/**
 * A declared failure on a route **outside `/api/**`** whose payload echoes the
 * two request headers the SSR header merge is about.
 *
 * Two things are observable here and nowhere else in this app:
 *
 * - `accept`, because Nitro's `isJsonRequest` is what decides whether an
 *   error comes back as JSON or as a rendered HTML error page, and its last
 *   resort is `event.path.startsWith('/api/')`. Every other route in this
 *   playground passes that test whether or not a header was sent, so **no route
 *   under `/api/` can tell you whether the header arrived**.
 * - `x-probe`, because the header merge's shipped defect class is a header
 *   the caller set going missing. The call site in `app.vue` passes it as a
 *   `Headers` **instance**, which is the exact shape that a naive spread drops
 *   whole — and which h3's `fetchWithEvent` also drops whole, on the SSR path
 *   `useFetch` takes.
 *
 * The e2e plan called for tests over the three transport paths plus a route
 * outside `/api/**`, and this is that route.
 */
const statusErrors = defineErrors({
  'payment-required': {
    status: 402,
    payload: payload<{ accept: string; probe: string }>(),
  },
})

export default defineTypedEventHandler(
  { errors: [statusErrors] },
  (event, { fail }) => {
    return fail('payment-required', {
      accept: getRequestHeader(event, 'accept') ?? 'none',
      probe: getRequestHeader(event, 'x-probe') ?? 'none',
    })
  }
)
