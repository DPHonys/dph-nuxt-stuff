import { defineBetterEventHandler } from '../../../lib/handler'
import { schema } from '../../../lib/schema'

// Object body with a transform (wire string, handler number); tuple query.
export default defineBetterEventHandler(
  {
    input: {
      body: schema<
        { name: string; age: string },
        { name: string; age: number }
      >(),
      query: [schema<{ team: string }>(), schema<{ page?: number }>()],
    },
    errors: { forbidden: { status: 403 } },
  },
  (_event, { body, query, fail }) => {
    if (body.age < 18) throw fail('forbidden')
    return { id: '1', team: query.team, page: query.page ?? 1, age: body.age }
  }
)
