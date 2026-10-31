/**
 * Whether the development-only assertions run: a response against the
 * route's declared `output`, a thrown Known error's fields against its
 * declared schema, and a thrown `_tag` the route never declared.
 *
 * `import.meta.dev` is a build-time constant in both the Nuxt and the Nitro
 * build, so a production bundle starts this `false` and never runs a check.
 * The `devChecks: false` module option turns it off inside a development
 * server through the Nitro plugin in `plugins/dev-checks.ts`.
 */
// A module-level flag rather than a per-route capture: the plugin that clears
// it runs when the Nitro app is created, which a lazily evaluated route file
// can be either side of. Read per check, written once at most.
let enabled = import.meta.dev === true

/**
 * Turn the development checks on or off for the rest of this server's life:
 * what the `devChecks: false` option does, through its Nitro plugin. Also the
 * seam the suites drive, since a check that only ran under a real development
 * server could not be tested at all.
 */
export function setDevChecks(next: boolean): void {
  enabled = next
}

/** Whether the next check should run. */
export function devChecksEnabled(): boolean {
  return enabled
}
