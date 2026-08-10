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
