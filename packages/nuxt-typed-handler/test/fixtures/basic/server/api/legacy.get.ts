import { defineEventHandler } from 'h3'

/** Unbranded, and keyed anyway - what makes the lookup total. */
export default defineEventHandler(() => ({ legacy: true }))
