/**
 * The `nitropack/runtime` double, wired in by each module's `vitest.config.ts`
 * alias: the real entry point resolves `#nitro-internal-virtual/*` specifiers
 * that only a built Nitro app defines, so it cannot load under a plain
 * `vitest run`.
 */

export const defineNitroPlugin = <T>(plugin: T): T => plugin
