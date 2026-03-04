import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  workspaces: {
    '.': {
      entry: [
        'eslint.config.mjs',
        'commitlint.config.ts',
        'knip.config.ts',
        'turbo.json',
      ],
    },
    'packages/*': {
      entry: ['src/index.ts', 'src/module.ts', 'src/plugin.ts'],
    },
  },
}

export default config
