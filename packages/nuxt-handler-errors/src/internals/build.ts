// The build-time internals `@dphonys/nuxt-typed-handler` composes its own
// `module.ts` from: the slot-aware map emitter and the channel helpers, each
// parameterised on the caller's module name. Semver-honoured; not for
// application code. Bundled by rollup through `build.config.ts`, so it may
// import `@nuxt/kit` freely - it never reaches a runtime bundle.

export { addChannelStripErrorHandler } from '../build/channel-strip'
export { addChannelToken, normalizeChannelToken } from '../build/channel-token'
export { warnCustomErrorHandler } from '../build/error-handler-warning'
export {
  emitMap,
  EMPTY_MAP,
  emptyMap,
  KNOWN_ERRORS_SLOT,
  TYPES_SPECIFIER,
} from '../emit-map'
export type {
  EmitMapOptions,
  EmitMapSlot,
  NitroPathOptions,
  SlotImport,
} from '../emit-map'
