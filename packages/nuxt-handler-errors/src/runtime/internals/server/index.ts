// The Nitro-side internals `@dphonys/nuxt-typed-handler` composes its own
// handler from. Semver-honoured; not for application code. May import `h3`;
// must not reach `@nuxt/kit`, `#app`, or the channel-token alias - the
// layering suite enforces it.

export {
  createFail,
  createKnownError,
  raiseKnown,
  resolveDeclared,
} from '../../server/lib/declared'
export type { DeclaredError } from '../../server/lib/declared'
export {
  createCheckedEventFetch,
  EventFetchUnavailableError,
} from '../../server/lib/event-checked-fetch'
export type { RawEventFetch } from '../../server/lib/event-checked-fetch'
export { createChannelStripHandler } from '../../server/lib/channel-strip'
