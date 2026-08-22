import { describe, expect, it } from 'vitest'
import { raiseValidationError } from '../../src/runtime/internals/server'
import { readValidationMarker } from '../../src/runtime/internals/shared'
import type { ValidationIssue } from '../../src/runtime/types'

// The default `onInvalid`, called directly: the exact error shape the wire
// suites observe from the outside.

const issues: readonly ValidationIssue[] = [
  { source: 'query', message: 'Expected a number', path: ['page'] },
  { source: 'query', message: 'Invalid enum value', path: ['sort', 0] },
]

function thrownBy(raise: () => never): unknown {
  try {
    raise()
  } catch (error) {
    return error
  }
}

describe('raiseValidationError', () => {
  it('throws the marked 400 in its one fixed shape', () => {
    const error = thrownBy(() => raiseValidationError('query', issues))

    expect(error).toMatchObject({
      statusCode: 400,
      statusMessage: 'Validation Error',
      message: 'Validation failed for query',
      data: { issues },
    })
  })

  it('hangs a marker that is a copy of the issues, not the same object', () => {
    const error = thrownBy(() => raiseValidationError('query', issues))
    const marker = readValidationMarker(error)
    const data = (error as { data: { issues: ValidationIssue[] } }).data

    expect(marker?.issues).toEqual(issues)
    expect(marker?.issues).not.toBe(data.issues)
    expect(marker?.issues[0]).not.toBe(data.issues[0])
    expect(marker?.issues[0]?.path).not.toBe(data.issues[0]?.path)
  })
})
