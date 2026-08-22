/**
 * The `nitropack/runtime` double, wired in by `vitest.config.ts`'s alias: the
 * real entry point resolves `#nitro-internal-virtual/*` specifiers that only a
 * built Nitro app defines, so it cannot load under a plain `vitest run`.
 */

export const defineNitroPlugin = <T>(plugin: T): T => plugin
