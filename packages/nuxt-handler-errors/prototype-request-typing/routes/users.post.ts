import { defineError } from '../../src/runtime/server'
import { schema } from '../lib/schema'
import { defineTypedEventHandler } from '../lib/typed-handler'

const forbidden = defineError('forbidden', { status: 403 })

export default defineTypedEventHandler(
  {
    validate: {
      // Transforming body: wire sends `age` as a string, the handler receives a number.
      body: schema<{ name: string; age: string }, { name: string; age: number }>(),
      // Tuple query: both elements parse the whole raw query; the wire must satisfy both.
      query: [schema<{ team: string }>(), schema<{ page?: number }>()],
    },
    errors: [forbidden],
  },
  (_event, { body, query, fail }) => {
    if (body.age < 18) fail('forbidden')
    return { id: '1', team: query.team, page: query.page ?? 1, ageIsNumber: body.age + 1 }
  }
)
