import { defineEventHandler } from 'h3'
import { observe } from '../../relay'

/** `$betterFetch`, the global, from a Nitro handler. */
export default defineEventHandler(() => observe($betterFetch))
