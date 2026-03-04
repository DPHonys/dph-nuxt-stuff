import antfu from '@antfu/eslint-config'
import prettier from 'eslint-config-prettier'

export default antfu(
  {
    type: 'lib',
    stylistic: false
  },
  prettier
)
