import {
  defineErrors,
  defineTypedEventHandler,
  payload,
} from '@dphonys/nuxt-handler-errors/shared'

/**
 * A catalogue with a status h3 will refuse to put on the wire.
 *
 * `sanitizeStatusCode` rewrites anything outside 100–999 to the handler's
 * default, so the HTTP status and the declared status genuinely disagree here.
 * That is exactly why SPEC.md §5.3 duplicates the status *inside* the marker
 * and makes that copy authoritative: the client reads the value its generated
 * type promised, and the two agree by construction rather than by hope.
 *
 * `status` is typed `ErrorStatus` — the common literals unioned with an open
 * `number` arm — so a wrong status reads wrong without the set being closed.
 */
const rogueErrors = defineErrors({
  'out-of-range': { status: 1042, payload: payload<{ declared: number }>() },
})

export default defineTypedEventHandler(
  { errors: [rogueErrors] },
  (_event, { fail }) => {
    return fail('out-of-range', { declared: 1042 })
  }
)
