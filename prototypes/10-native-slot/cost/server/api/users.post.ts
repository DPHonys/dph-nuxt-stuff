import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

export default defineBetterEventHandler(
  {
    input: {
      // Transforming body: the wire sends `age` as a string, the handler gets a number.
      body: schema<
        { name: string; age: string },
        { name: string; age: number }
      >(),
      // Tuple query: both elements parse the whole raw query.
      query: [schema<{ team: string }>(), schema<{ page?: number }>()],
    },
    errors: { forbidden: { status: 403 } },
  },
  (_event, { body, query, fail }) => {
    if (body.age < 18) throw fail('forbidden')
    return {
      id: '1',
      team: query.team,
      page: query.page ?? 1,
      ageIsNumber: body.age + 1,
    }
  }
)
