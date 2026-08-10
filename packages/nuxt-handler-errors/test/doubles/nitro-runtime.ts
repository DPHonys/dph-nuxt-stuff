/**
 * The `nitropack/runtime` double, wired in by `vitest.config.ts`'s alias.
 *
 * The real entry point cannot be imported outside a built Nitro app — it
 * resolves `#nitro-internal-virtual/*` specifiers that only the build defines —
 * so a plain `vitest run` cannot load either Nitro plugin at all. What those
 * plugins' tests assert is the setup function's own effect, so this hands the
 * function back unchanged and simulates nothing of Nitro's plugin lifecycle.
 */

export const defineNitroPlugin = <T>(plugin: T): T => plugin

/**
 * What Nitro's `useRuntimeConfig(event?)` answers next — the server-side route
 * to the channel token. A plain box, like the `#app` double's: the default
 * carries no token, which is the "gating off" case the other suites assume.
 */
let runtimeConfig: unknown = { public: {} }

export function setRuntimeConfig(config: unknown): void {
  runtimeConfig = config
}

export const useRuntimeConfig = (): unknown => runtimeConfig
