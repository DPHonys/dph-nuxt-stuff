import { defineError } from '../../src/runtime/server'
import { defineTypedEventHandler } from '../lib/typed-handler'

const gone = defineError('gone', { status: 410 })

/** `errors` only: context is `{ fail }`, request side is vanilla. */
export default defineTypedEventHandler({ errors: [gone] }, (_event, ctx) => {
  // @ts-expect-error - no validate → no validated sources on the context
  void ctx.body
  if (Math.random() > 2) ctx.fail('gone')
  return { ok: true as const }
})
