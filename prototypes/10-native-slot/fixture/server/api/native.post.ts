import { defineEventHandler } from 'h3'
import type { H3Event } from 'h3'

// Foreign handler that fills the slot itself (h3's own generic): Nuxt types it,
// our map does not (no brand).
export default defineEventHandler<{ body: { x: number } }>((event: H3Event) => {
  void event
  return { ok: true }
})
