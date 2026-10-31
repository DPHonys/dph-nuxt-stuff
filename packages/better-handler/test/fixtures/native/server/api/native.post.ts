import { defineEventHandler } from 'h3'

// Not this package's, filling h3's slot itself: Nuxt reads it, our map has
// no brand to read.
export default defineEventHandler<{ body: { x: number } }>(() => ({
  ok: true,
}))
