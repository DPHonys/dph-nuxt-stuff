import { defineEventHandler } from 'h3'
import { observe } from '../../relay'

/** `event.$betterFetch`, bound to the request this handler answers. */
export default defineEventHandler((event) => observe(event.$betterFetch))
