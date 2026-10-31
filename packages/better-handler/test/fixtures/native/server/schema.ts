import type { StandardSchemaV1 } from '@standard-schema/spec'

/**
 * A Standard Schema of the given input and output types that accepts every
 * value as it is: the door to the shapes the agreement suite needs and no
 * schema library spells directly. This app is only ever prepared and
 * compiled, never served.
 */
export function schema<Input, Output = Input>(): StandardSchemaV1<
  Input,
  Output
> {
  return {
    '~standard': {
      version: 1,
      vendor: 'native-fixture',
      validate: () => ({ issues: [{ message: 'never served' }] }),
    },
  }
}
