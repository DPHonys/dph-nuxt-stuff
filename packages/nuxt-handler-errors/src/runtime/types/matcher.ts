/**
 * The read surface: what `matchError` accepts, the arms it dispatches to, and
 * the fallback that catches everything else.
 *
 * Every shape here was measured in the sandbox; the ones that compiled while
 * being wrong carry their reason inline, because nothing in the code says it.
 */

import type { NuxtError } from 'nuxt/app'
import type { MaybeRef } from 'vue'
import type { KnownErrorBody } from '../shared/wire'
import type { KnownVariant } from './known-error'

/**
 * What the matcher accepts: the marker may or may not be there. Structural and
 * deliberately minimal — `NuxtError<KnownErrorBody<E>>` reduced to the one
 * property the read walks, so both runtimes' carriers inhabit it (an `H3Error`
 * satisfies `NuxtError` structurally) and an undeclared route's `data?:
 * unknown` is not assignable for any `E`, leaving the degraded overload
 * reachable instead of matching with `E` widened.
 */
export interface KnownErrorCarrier<E extends KnownVariant> {
  data?: KnownErrorBody<E> | undefined
}

/**
 * The declared union recovered from a carrier. A **naked** conditional, so it
 * distributes: a union of carriers — a repository method touching two routes —
 * yields the union of every route's variants, and the arms stay exhaustive
 * across all of them.
 */
export type VariantOf<C> = C extends KnownErrorCarrier<infer E> ? E : never

/**
 * One arm per declared tag, each receiving the whole variant (`{ tag, status }`
 * and the payload). Arms handle, they do not produce: the return is `void` and
 * there is no inferred `R`. Any inferred arms return type either blamed the
 * wrong argument when arms disagreed, fell through to the degraded overload,
 * or leaked `| undefined` into every util writing `return matchError(…)`.
 */
export type Arms<E extends KnownVariant> = {
  [K in E['tag']]: (variant: Extract<E, { tag: K }>) => void
}

/**
 * The fallback: positional (no key-namespace collision with user tags) and
 * required (an omitted one could only ever swallow the unanticipated case).
 * `unrecognized` is the wire floor of a failure the server declared and this
 * call site has not heard of — deploy skew on a typed call, or every marked
 * variant on a degraded one.
 */
export type Fallback = (error: NuxtError, unrecognized?: KnownVariant) => void

/**
 * The matcher's two overloads — never three. The `void` return is load-bearing
 * three ways: `return matchError(…)` in a value-returning function is an
 * error, `if (matchError(…))` is TS1345 (which does *not* fire on
 * `void | undefined`), and with no inferred `R` nothing can pin the arms.
 */
export interface MatchError {
  /**
   * Typed. Generic over the whole **carrier**, not the variant union: an
   * `E`-generic form infers `E` from one member of a carrier union and rejects
   * the call. The arms have no inference site, so they cannot pin anything —
   * which is also why `NoInfer` is not (and must not be) reached for here; it
   * silently turns every arm parameter into `never` inside a mapped-type key.
   */
  <C extends KnownErrorCarrier<KnownVariant>>(
    error: MaybeRef<C | null | undefined>,
    arms: Arms<VariantOf<C>>,
    fallback: Fallback
  ): void

  /**
   * Degraded: a vanilla `useFetch`, an undeclared route, an `unknown` in a
   * `catch`. The arms are `Record<string, never>` — `{}` and nothing else —
   * because this overload's error parameter is `unknown` and therefore
   * assignable from every call: any more permissive arms type silently
   * disables exhaustiveness on typed calls missing an arm. This surface
   * matches no tags and reads them off the fallback's second parameter.
   */
  (error: unknown, arms: Record<string, never>, fallback: Fallback): void
}
