import { receipt } from '~~/server/io/schemas'

/**
 * `/api/refusals/response` - a response the declared output rejects, handed
 * over as a value the types never saw. A dev server refuses it with a plain
 * `500` naming the route, the status and the issues; a production build, or
 * `devChecks: false`, sends it as it was handed over.
 */
export default defineBetterEventHandler({ output: receipt }, () =>
  JSON.parse('{"id":"seven","total":42}')
)
