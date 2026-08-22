import type { Nuxt } from '@nuxt/schema'

// Prepends to the error-handler chain and preserves every existing entry -
// the chain runs in order with the builtin last.
export function addChannelStripErrorHandler(
  nuxt: Nuxt,
  token: string | undefined,
  handlerPath: string
): void {
  if (token === undefined) return

  nuxt.hook('nitro:config', (nitroConfig) => {
    const existing = nitroConfig.errorHandler
    const entries =
      existing === undefined
        ? []
        : Array.isArray(existing)
          ? existing
          : [existing]

    nitroConfig.errorHandler = [handlerPath, ...entries]
  })
}
