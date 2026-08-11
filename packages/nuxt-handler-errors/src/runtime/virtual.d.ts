// The build-only specifier `src/module.ts` aliases in both builds. This
// declaration is what lets the runtime sources typecheck outside a build.
declare module '#nuxt-handler-errors/channel-token' {
  /**
   * The `channelToken` module option, normalised: `undefined` when the
   * consumer opted out with `false`, the literal token otherwise.
   */
  export const configuredChannelToken: string | undefined
}
