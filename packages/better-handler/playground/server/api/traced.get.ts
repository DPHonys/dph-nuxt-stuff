import { z } from 'zod'

/**
 * `/api/traced` with an `X-Trace` header - the headers source. h3 hands
 * headers over with lowercased keys, so the schema keys them lowercase.
 */
export default defineBetterEventHandler(
  { input: { headers: z.object({ 'x-trace': z.string().min(1) }) } },
  (_event, { headers }) => ({ trace: headers['x-trace'] })
)
