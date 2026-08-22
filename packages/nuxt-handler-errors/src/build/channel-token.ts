import { addTemplate, logger } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

/**
 * `false` is the explicit opt-out. `''` collapses to the same - an empty
 * header value could never round-trip - but only `false` can mean it on
 * purpose, so an empty string additionally warns: it is how an unset env
 * var interpolated into the config would silently ship without gating.
 *
 * `name` is the calling module's name; it prefixes the warning.
 */
export function normalizeChannelToken(
  channelToken: string | false,
  name: string
): string | undefined {
  if (channelToken === '') {
    logger.warn(
      `[${name}] \`channelToken\` is an empty string, so channel ` +
        'gating is disabled. If that is intended, set `channelToken: false`; ' +
        'an empty string usually means an unset value reached the config.'
    )
  }

  return channelToken === false || channelToken === ''
    ? undefined
    : channelToken
}

/**
 * Writes `<name>/channel-token.mjs` and points both builds at it through
 * the `#<name>/channel-token` alias: `nuxt.options.alias` reaches the app
 * build only, so the Nitro half rides `nitro:config`. Returns the alias.
 *
 * An alias rather than a published entry: the value only exists inside a
 * build. `write: true` is load-bearing - the Nitro build resolves the alias
 * from disk, not from Nuxt's virtual file system.
 */
export function addChannelToken(
  nuxt: Nuxt,
  name: string,
  token: string | undefined
): string {
  const specifier = `#${name}/channel-token`

  const template = addTemplate({
    filename: `${name}/channel-token.mjs`,
    write: true,
    getContents: () =>
      `export const configuredChannelToken = ${
        token === undefined ? 'undefined' : JSON.stringify(token)
      }\n`,
  })

  nuxt.options.alias[specifier] = template.dst

  nuxt.hook('nitro:config', (nitroConfig) => {
    nitroConfig.alias = { ...nitroConfig.alias, [specifier]: template.dst }
  })

  return specifier
}
