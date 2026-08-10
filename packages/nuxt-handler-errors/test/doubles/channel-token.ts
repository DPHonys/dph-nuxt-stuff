/**
 * The `#nuxt-handler-errors/channel-token` double, wired in by
 * `vitest.config.ts`'s alias.
 *
 * In a real build the specifier resolves to the template `src/module.ts`
 * writes — one constant carrying the configured token. Under a plain
 * `vitest run` there is no build and no template, so this stands in with a
 * **settable** binding: ESM live bindings mean every importer sees the value
 * a suite sets, which is exactly the axis the header-merge tests vary. The
 * default is no token, the "gating off" case every other suite assumes.
 */

// The mutable export is the double's entire mechanism: importers must see the
// value a suite sets, through the same named binding the template exports.
// eslint-disable-next-line import/no-mutable-exports
export let configuredChannelToken: string | undefined

export function setConfiguredChannelToken(next: string | undefined): void {
  configuredChannelToken = next
}
