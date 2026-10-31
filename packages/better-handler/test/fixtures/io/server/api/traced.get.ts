import { z } from 'zod'
import { defineBetterEventHandler } from '../../../../../src/runtime/server'

/** The headers source, keyed lowercase as h3 hands headers over. */
export default defineBetterEventHandler(
  { input: { headers: z.object({ 'x-trace': z.string().min(1) }) } },
  (_event, { headers }) => ({ trace: headers['x-trace'] })
)
