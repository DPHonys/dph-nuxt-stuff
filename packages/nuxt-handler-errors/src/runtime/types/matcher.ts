import type { NuxtError } from 'nuxt/app'
import type { MaybeRef } from 'vue'
import type { KnownErrorBody } from '../shared/wire'
import type { KnownVariant } from './known-error'

/** An error carrying a route's declared union - what the matcher accepts. */
export interface KnownErrorCarrier<E extends KnownVariant> {
  data?: KnownErrorBody<E> | undefined
}

/** The declared union recovered from a carrier. Distributes over unions. */
export type VariantOf<C> = C extends KnownErrorCarrier<infer E> ? E : never

/** One arm per declared tag, each receiving the whole variant. */
export type Arms<E extends KnownVariant> = {
  [K in E['tag']]: (variant: Extract<E, { tag: K }>) => void
}

/**
 * The required fallback for everything the arms don't cover. `unrecognized`
 * is set when the server declared the failure but this call site has not
 * heard of it - deploy skew, or any marked variant on a degraded call.
 */
export type Fallback = (error: NuxtError, unrecognized?: KnownVariant) => void

// The `void` return is load-bearing: with no inferred `R` nothing can pin
// the arms, and `return matchError(…)` in a value-returning function errors.
export interface MatchError {
  // Generic over the whole carrier, not the variant union: an `E`-generic
  // form infers `E` from one member of a carrier union and rejects the call.
  <C extends KnownErrorCarrier<KnownVariant>>(
    error: MaybeRef<C | null | undefined>,
    arms: Arms<VariantOf<C>>,
    fallback: Fallback
  ): void

  // Degraded: a vanilla `useFetch`, an undeclared route, an `unknown` in a
  // `catch`. Arms must be `{}` - anything more permissive silently disables
  // exhaustiveness on typed calls missing an arm.
  (error: unknown, arms: Record<string, never>, fallback: Fallback): void
}
