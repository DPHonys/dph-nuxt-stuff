import { defineBetterEventHandler } from '@dphonys/better-handler/server'
import { reportOutput } from '../outputs'

// Output only: no source declared.
export default defineBetterEventHandler({ output: reportOutput }, () => ({
  total: 1,
  at: new Date(0),
}))
