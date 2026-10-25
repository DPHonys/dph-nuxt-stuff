import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { schema } from '../schema'

// Output only: no source declared.
export default defineBetterEventHandler(
  { output: schema<{ total: number }>() },
  () => ({ total: 1 })
)
