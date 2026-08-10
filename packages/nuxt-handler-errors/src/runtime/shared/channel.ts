/**
 * Channel gating, the request half: the header a first-party call carries, and
 * the one place that knows where the token lives in `runtimeConfig`.
 *
 * **The token is a channel tag, not a secret.** It rides `runtimeConfig.public`
 * by design — it ships in the client bundle and is visible in devtools — and it
 * marks first-party intent so a response to anyone else can go out with the
 * marker stripped. Never treat it as authentication, and never gate anything on
 * it that a forged header must not reach.
 *
 * Core: nothing here imports `@nuxt/kit`, `#app` or the Nitro runtime. Each
 * surface reads the token in the way its own environment allows and hands it
 * in — the app composables through `useRuntimeConfig()`, the two globals
 * through {@link setChannelToken} from their installing plugin, the event-bound
 * wrapper as a constructor argument.
 */

/**
 * The request header a checked call carries when a token is configured.
 * Frozen wire protocol, like the marker key: the server side matches on this
 * exact name, and versioning is by rename.
 */
export const CHANNEL_HEADER = 'x-known-error-channel'

/** Where the token sits under `runtimeConfig.public`. `configKey`, verbatim. */
export const CHANNEL_CONFIG_KEY = 'handlerErrors'

/** The property under {@link CHANNEL_CONFIG_KEY}. */
export const CHANNEL_TOKEN_KEY = 'channelToken'

/**
 * The token out of a whole `runtimeConfig` object —
 * `public.handlerErrors.channelToken` — or `undefined` when it is absent, not a
 * string, or empty.
 *
 * The empty string counts as absent on purpose: the module seeds the key with
 * `''` so `NUXT_PUBLIC_HANDLER_ERRORS_CHANNEL_TOKEN` can fill it at run time
 * (Nuxt only overrides keys that already exist), and an unset env variable must
 * mean gating off rather than "every request carries an empty tag".
 */
export function readChannelToken(runtimeConfig: unknown): string | undefined {
  const config = runtimeConfig as
    | { public?: Record<string, unknown> }
    | null
    | undefined

  const section = config?.public?.[CHANNEL_CONFIG_KEY] as
    | Record<string, unknown>
    | null
    | undefined

  const token = section?.[CHANNEL_TOKEN_KEY]

  return typeof token === 'string' && token !== '' ? token : undefined
}

/**
 * The token the two `$checkedFetch` globals attach.
 *
 * A module-scope box rather than a parameter because the global is built once,
 * at import time, and the config is only readable from inside a plugin. Each
 * side's installing plugin sets it, and the merge reads it at **call** time —
 * the same "read late" rule that lets those plugins be one assignment each.
 */
let token: string | undefined

/** Set by the installing plugin; `undefined` turns the attach off. */
export function setChannelToken(next: string | undefined): void {
  token = next
}

/** The configured token, read at call time. */
export function channelToken(): string | undefined {
  return token
}
