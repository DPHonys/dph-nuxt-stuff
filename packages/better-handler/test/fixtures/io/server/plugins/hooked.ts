import type { H3Event } from 'h3'
import { setResponseHeader } from 'h3'

/** The one part of a Nitro app this plugin touches. */
interface ResponseHooks {
  readonly hooks: {
    hook: (name: 'beforeResponse', listener: (event: H3Event) => void) => void
  }
}

/**
 * A `beforeResponse` hook setting a header on every receipt reply, as an app
 * adding a header to its responses would: it runs after the Handler, so a
 * reply already sent would refuse the header.
 */
export default (nitroApp: ResponseHooks): void => {
  nitroApp.hooks.hook('beforeResponse', (event) => {
    if (event.path.startsWith('/api/receipts')) {
      setResponseHeader(event, 'x-hooked', 'yes')
    }
  })
}
