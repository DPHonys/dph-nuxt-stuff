/**
 * Channel gating, the request half: the header a first-party call carries.
 *
 * **The token is a channel tag, not a secret.** It is compiled into the client
 * bundle by design — the browser must send it too — and it marks first-party
 * intent so a response to anyone else can go out with the marker stripped.
 * Never treat it as authentication, and never gate anything on it that a
 * forged header must not reach.
 *
 * The token itself is a build-time module option: `src/module.ts` writes the
 * configured value as a template, and every surface imports it as
 * `configuredChannelToken` from `#nuxt-handler-errors/channel-token` — one
 * constant, the same in every bundle, with no runtime config to read.
 */

/**
 * The request header a checked call carries when a token is configured.
 * Frozen wire protocol, like the marker key: the server side matches on this
 * exact name, and versioning is by rename.
 */
export const CHANNEL_HEADER = 'x-known-error-channel'
