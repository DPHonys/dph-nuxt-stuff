// The `@dphonys/nuxt-handler-errors/server` entry point. Server-only by
// construction: `defineCheckedEventHandler` calls h3's `defineEventHandler`,
// and `defineError` shares a module-private symbol with it.

export { defineCheckedEventHandler, defineError, payload } from './lib/errors'
export { recognizeKnownError } from './lib/recognize-known-error'
