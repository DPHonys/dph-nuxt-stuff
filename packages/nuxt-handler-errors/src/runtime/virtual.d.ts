/**
 * The build-only specifier `src/module.ts` aliases in both builds: a template
 * exporting the configured channel token as one constant. This declaration is
 * what lets the runtime sources typecheck outside a build — inside one, the
 * alias resolves to the written template; under `vitest`, to the test double.
 */
declare module '#nuxt-handler-errors/channel-token' {
  /**
   * The `channelToken` module option, normalised: `undefined` when the
   * consumer opted out with `''`, the literal token otherwise (the module's
   * own default when nothing is configured).
   */
  export const configuredChannelToken: string | undefined
}
