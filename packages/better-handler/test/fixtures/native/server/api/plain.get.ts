import { defineEventHandler } from 'h3'

// Not this package's: no slot, no brand.
export default defineEventHandler(() => ({ plain: true }))
