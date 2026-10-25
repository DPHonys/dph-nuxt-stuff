import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// An array query beside a record body: the body must survive the query.
export default defineBetterEventHandler(
  {
    input: {
      query: schema<string[]>(),
      body: schema<{ title: string }>(),
    },
  },
  (_event, { body }) => ({ title: body.title })
)
