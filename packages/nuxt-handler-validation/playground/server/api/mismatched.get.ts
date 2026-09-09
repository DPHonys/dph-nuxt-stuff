import { z } from 'zod'

/**
 * Declares a `{ id: string }` reply and hands over `{ id: 42 }`: the value
 * arrives through a parse, which is where the types stop being a promise. The
 * one route whose answer a development server and a production build differ
 * on - checked and refused in development, sent as it is in production.
 */
export default defineValidatedEventHandler(
  { output: z.object({ id: z.string() }) },
  () => JSON.parse('{"id":42}')
)
