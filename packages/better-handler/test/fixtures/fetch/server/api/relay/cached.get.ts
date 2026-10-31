import { defineCachedEventHandler } from 'nitropack/runtime'
import { observe } from '../../relay'

/**
 * `event.$betterFetch` inside a cached handler: Nitro runs it on a fresh
 * event of its own, made past every `request` hook.
 */
export default defineCachedEventHandler((event) => observe(event.$betterFetch))
