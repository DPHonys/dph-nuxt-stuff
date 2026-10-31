import { resolveErrors } from '../../../../../src/runtime/server/errors/declaration'
import { createFail } from '../../../../../src/runtime/server/errors/fail'
import { makeEventHandler } from '../../../../../src/runtime/shared/h3'

const fail = createFail(resolveErrors({ 'order-locked': { status: 409 } }))

/** A Fail helper call the types would refuse: a tag the route never declared. */
export default makeEventHandler(() => {
  throw fail('order-unknown')
})
