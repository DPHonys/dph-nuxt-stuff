// The composables `app.vue` calls, auto-imported as an app gets them. Nuxt
// declares them in the fixture's own generated `.nuxt`, which the package's
// typecheck does not read, so they are restated here for it. Never imported
// by path in `app.vue`: Nuxt 4.0's compiler keys a composable imported by a
// relative specifier as a foreign function, and leaves the call unkeyed.

// Exported, which also makes this file a module, as `declare global` needs.
export type Composables =
  typeof import('../../../src/runtime/app/composables/use-better-fetch') &
    typeof import('../../../src/runtime/app/composables/use-better-async-data') &
    typeof import('../../../src/runtime/app/composables/use-request-better-fetch')

declare global {
  const useBetterFetch: Composables['useBetterFetch']
  const useLazyBetterFetch: Composables['useLazyBetterFetch']
  const useBetterAsyncData: Composables['useBetterAsyncData']
  const useLazyBetterAsyncData: Composables['useLazyBetterAsyncData']
  const useRequestBetterFetch: Composables['useRequestBetterFetch']
}
