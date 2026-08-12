import type { H3Event } from 'h3'
import { getQuery, getRequestHeaders, getRouterParams, readBody } from 'h3'
import type { ValidationSource } from '../../types/schemas'

/** How one source is taken off the event. */
type SourceReader = (event: H3Event) => unknown

/**
 * Every source exactly once, paired with its reader: a permutation type over
 * `ValidationSource`.
 *
 * The annotation is load-bearing, not decoration. A source left out of the walk
 * would type-check everywhere and then silently never validate - the precise
 * bug this walk exists to prevent - so omitting one, naming one twice, or
 * adding a fifth source to `ValidateSchemas` without walking it all fail to
 * compile. `satisfies readonly ValidationSource[]` would prove only that each
 * entry *is* a source, never that all of them are here.
 */
type SourceWalk<Remaining extends ValidationSource = ValidationSource> = [
  Remaining,
] extends [never]
  ? readonly []
  : {
      [S in Remaining]: readonly [
        readonly [source: S, read: SourceReader],
        ...SourceWalk<Exclude<Remaining, S>>,
      ]
    }[Remaining]

/**
 * The four sources in the order they validate:
 * `routerParams -> query -> headers -> body`. Cheap-and-sync first,
 * stream-consuming last, so a failure in an earlier source spares the body
 * parse entirely.
 *
 * This array order is the promise. It is what makes "a bad route param means
 * the body is never read" something a caller can rely on, and it matches h3
 * v2's `defineValidatedHandler`, so the eventual alignment stays a rename.
 *
 * Each source is handed to its schema exactly as h3 yields it - nothing is
 * normalized, coerced or re-shaped on the way, because every conversion belongs
 * in the user's schema where all their other parsing rules live:
 *
 * - **routerParams** arrive decoded (h3's `decode: true`), so a schema sees
 *   what the user meant rather than percent-escapes. A catch-all segment
 *   arrives as one slash-joined string under the route's own key (`_` when the
 *   catch-all is anonymous) - h3's matcher decides that, not this package.
 * - **query** values are `string | string[]`; a repeated key becomes an array.
 * - **headers** have lowercase keys and multi-values joined with `", "`. No
 *   case-insensitivity and no splitting is added.
 * - **body** is h3's parse of the request payload.
 */
export const SOURCE_WALK: SourceWalk = [
  ['routerParams', (event) => getRouterParams(event, { decode: true })],
  ['query', (event) => getQuery(event)],
  ['headers', (event) => getRequestHeaders(event)],
  ['body', (event) => readBody(event)],
]
