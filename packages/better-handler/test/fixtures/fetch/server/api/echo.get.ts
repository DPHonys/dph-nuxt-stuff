import { defineEventHandler, getRequestHeader } from 'h3'

/** The two headers a relayed call is judged by, as this route received them. */
export default defineEventHandler((event) => ({
  accept: getRequestHeader(event, 'accept') ?? null,
  cookie: getRequestHeader(event, 'cookie') ?? null,
}))
