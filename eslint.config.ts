import antfu from '@antfu/eslint-config'
import prettierRecommended from 'eslint-plugin-prettier/recommended'

export default antfu(
  {
    type: 'lib',
    stylistic: false,
  },
  prettierRecommended
)
