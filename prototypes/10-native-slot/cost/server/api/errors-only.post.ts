import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

/** `errors` only: the context is `{ fail }`, the request side is vanilla. */
export default defineBetterEventHandler(
  { errors: { gone: { status: 410 } } },
  (_event, { fail }) => {
    if (Math.random() > 2) throw fail('gone')
    return { ok: true as const }
  }
)
