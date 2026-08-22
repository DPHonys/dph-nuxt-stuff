import { addTemplate, logger } from '@nuxt/kit'
import type { Nuxt } from '@nuxt/schema'

// `false` is the explicit opt-out. `''` collapses to the same - an empty
// header value could never round-trip - but only `false` can mean it on
// purpose, so an empty string additionally warns: it is how an unset env
// var interpolated into the config would silently ship without gating.
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

// An alias rather than a published entry: the value only exists inside a
// build. Returns the alias.
export function addChannelToken(
  nuxt: Nuxt,
  name: string,
  token: string | undefined
): string {
  const specifier = `#${name}/channel-token`

  // `write: true` is load-bearing: the Nitro build resolves the alias from
  // disk, not from Nuxt's virtual file system.
  const template = addTemplate({
    filename: `${name}/channel-token.mjs`,
    write: true,
    getContents: () =>
      `export const configuredChannelToken = ${
        token === undefined ? 'undefined' : JSON.stringify(token)
      }\n`,
  })

  nuxt.options.alias[specifier] = template.dst

  // The Nitro half - `nuxt.options.alias` reaches the app build only.
  nuxt.hook('nitro:config', (nitroConfig) => {
    nitroConfig.alias = { ...nitroConfig.alias, [specifier]: template.dst }
  })

  return specifier
}
