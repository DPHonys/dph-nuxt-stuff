import { afterEach, describe, expect, it } from 'vitest'
import {
  devChecksEnabled,
  setDevChecks,
} from '../../src/runtime/server/dev-checks'
import disableDevChecks from '../../src/runtime/server/plugins/dev-checks'

// The one flag behind the three development checks. Its starting value is
// `import.meta.dev`, which a plain suite run does not define.

afterEach(() => {
  setDevChecks(false)
})

describe('the devChecks flag', () => {
  it('starts off outside a development build', () => {
    expect(devChecksEnabled()).toBe(false)
  })

  it('is turned off for the server’s life by its Nitro plugin', () => {
    setDevChecks(true)
    expect(devChecksEnabled()).toBe(true)

    disableDevChecks()

    expect(devChecksEnabled()).toBe(false)
  })
})
