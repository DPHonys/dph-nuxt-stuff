import type { Nuxt } from '@nuxt/schema'

/**
 * The stripping seam: prepends `handlerPath` to Nitro's error-handler chain
 * and preserves every existing entry - the chain runs in order with the
 * builtin last. A no-op without a token, since there is nothing to match
 * requests against.
 *
 * `handlerPath` is the caller's: the strip handler file reads the token
 * through the *caller's* `#<name>/channel-token` alias, so each module
 * layer owns a one-line handler over `createChannelStripHandler`.
 */
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
