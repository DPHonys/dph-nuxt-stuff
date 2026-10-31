import { z } from 'zod'

/**
 * `/api/health` - an output-only route: it declares one `200` reply and
 * nothing else, so its context is empty, it validates nothing and it carries
 * no `validation-failed`.
 */
export default defineBetterEventHandler(
  { output: z.object({ ok: z.literal(true), at: z.iso.datetime() }) },
  () => ({ ok: true as const, at: new Date().toISOString() })
)
