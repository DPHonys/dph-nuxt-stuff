// PROTOTYPE (ticket 10). Throwaway runtime so a fixture app can boot: the
// prototype is about types; nothing is validated.
import { defineEventHandler } from 'h3'

export function defineBetterEventHandler(_options, handler) {
  return defineEventHandler((event) => handler(event, {}))
}
