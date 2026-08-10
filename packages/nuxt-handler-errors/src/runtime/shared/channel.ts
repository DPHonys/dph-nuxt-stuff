/**
 * The request header a checked call carries when a channel token is
 * configured. Frozen wire protocol — versioning is by rename. The token is a
 * channel tag, not a secret: it ships in the client bundle and authorises
 * nothing.
 */
export const CHANNEL_HEADER = 'x-known-error-channel'
