/**
 * The `#nuxt-handler-errors/channel-token` double, wired in by
 * `vitest.config.ts`'s alias. The real specifier resolves to a template the
 * module writes at build time; this stands in with a settable live binding so
 * suites can vary the token. The default is no token.
 */

// The mutable export is the double's entire mechanism: importers must see the
// value a suite sets, through the same named binding the template exports.
// eslint-disable-next-line import/no-mutable-exports
export let configuredChannelToken: string | undefined

export function setConfiguredChannelToken(next: string | undefined): void {
  configuredChannelToken = next
}
