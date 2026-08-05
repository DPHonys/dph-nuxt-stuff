/**
 * The `#app` double, wired in by `vitest.config.ts`'s single alias.
 *
 * `src/runtime/app/use-typed-fetch.ts` is app-side code: it imports `useFetch`
 * from `#app`, an alias that exists only inside a Nuxt build. This stands in
 * for the two functions it imports, and records what the wrapper handed them —
 * which is precisely the boundary SPEC.md §3.8's header merge is a claim about.
 *
 * It is not a simulation of `useFetch` and must not become one. The composable
 * running for real, against a real server, is `test/specifiers.test.ts`.
 *
 * `defineNuxtPlugin` is here for the same reason with even less to it: the
 * client plugin (`typed-fetch.plugin.test.ts`) is app-side code, and what its
 * test asserts is the setup function's own effect — so the double hands that
 * function back unchanged and simulates nothing of Nuxt's plugin lifecycle.
 */

/** One recorded call, in vanilla's own three-argument runtime shape. */
export interface RecordedCall {
  readonly name: 'useFetch' | 'useLazyFetch'
  readonly request: unknown
  readonly opts: Record<string, unknown> | undefined
  readonly autoKey: unknown
}

export const calls: RecordedCall[] = []

function record(name: RecordedCall['name']) {
  return (request: unknown, arg1?: unknown, arg2?: unknown): unknown => {
    calls.push({
      name,
      request,
      opts: arg1 as Record<string, unknown> | undefined,
      autoKey: arg2,
    })

    return { data: { value: undefined }, error: { value: undefined } }
  }
}

export const useFetch = record('useFetch')
export const useLazyFetch = record('useLazyFetch')

export const defineNuxtPlugin = <T>(plugin: T): T => plugin
