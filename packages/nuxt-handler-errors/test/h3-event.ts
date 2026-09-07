import { createEvent } from 'h3'
import type { H3Event } from 'h3'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'

/**
 * A real h3 event over a request that never arrived: what a handler under
 * test is called with directly, when nothing about the request is read.
 */
export function createTestEvent(): H3Event {
  const request = new IncomingMessage(new Socket())

  return createEvent(request, new ServerResponse(request))
}
