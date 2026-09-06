import type { H3Error } from 'h3'
import { isError } from 'h3'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { raiseValidationError } from '../../src/runtime/internals/server'
import { readValidationMarker } from '../../src/runtime/internals/shared'
import type { ValidationIssue } from '../../src/runtime/types'

// The default `onInvalid`, called directly: the exact error shape the wire
// suites observe from the outside.

const issues: readonly ValidationIssue[] = [
  { source: 'query', message: 'Expected a number', path: ['page'] },
  { source: 'query', message: 'Invalid enum value', path: ['sort', 0] },
]

/** The H3Error a raise threw - anything else is the failure this reports. */
function thrownBy(raise: () => never): H3Error {
  try {
    raise()
  } catch (error) {
    if (isError(error)) return error

    throw new Error('the raise threw something other than an H3Error', {
      cause: error,
    })
  }
}

/** The wire payload as the error carries it, narrowed in place - no copy. */
const WIRE_DATA = z.looseObject({
  issues: z.array(
    z.looseObject({
      source: z.string(),
      message: z.string(),
      path: z.array(z.union([z.string(), z.number()])),
    })
  ),
})

function isWireData(
  value: H3Error['data']
): value is z.infer<typeof WIRE_DATA> {
  return WIRE_DATA.safeParse(value).success
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

  it('hangs a marker that no edit of the wire payload reaches', () => {
    // The raise copies the array, not the issues in it, so the fixture is
    // reached by the edits below; the comparison is against a snapshot.
    const raised = structuredClone(issues)
    const error = thrownBy(() => raiseValidationError('query', issues))
    const { data } = error

    if (!isWireData(data)) throw new Error('the 400 carries no issues')

    const [first] = data.issues

    if (first === undefined) throw new Error('the 400 carries no issues')

    // The wire payload is enumerable, so every middleware in the chain can edit
    // an issue in place, its path, or the array. None of that may reach the
    // marker, which is the raise's own snapshot.
    first.message = 'forged'
    first.path.push('forged')
    data.issues.push({ source: 'body', message: 'forged', path: [] })

    expect(readValidationMarker(error)).toEqual({ issues: raised })
  })
})
