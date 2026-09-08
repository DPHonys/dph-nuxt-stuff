import { readFloor } from '@dphonys/nuxt-handler-errors/internals/shared'
import { KNOWN_ERROR_KEY } from '@dphonys/nuxt-handler-errors/shared'
import {
  readValidationMarker,
  VALIDATION_ERROR_KEY,
} from '@dphonys/nuxt-handler-validation/internals/shared'
import type { ValidationIssue } from '@dphonys/nuxt-handler-validation/types'
import { describe, expect, it } from 'vitest'
import {
  recognizeKnownError,
  recognizeValidationError,
} from '../../src/runtime/server'
import {
  onInvalid,
  validationFailedError,
} from '../../src/runtime/server/lib/on-invalid'

// The built-in variant's shape, off the live error the hook throws.

const issues: ValidationIssue[] = [
  { source: 'query', message: 'page must be a whole number', path: ['page'] },
  { source: 'query', message: 'sort must be asc or desc', path: ['sort'] },
]

describe('the built-in validation-failed variant', () => {
  const error = validationFailedError(issues)

  it('is what the hook throws', () => {
    expect(() => onInvalid('query', issues)).toThrow(
      expect.objectContaining({ statusCode: 400, message: 'validation-failed' })
    )
  })

  it('is a known error: 400, message === tag, no reason phrase', () => {
    expect(error).toBeInstanceOf(Error)
    expect(error.statusCode).toBe(400)
    expect(error.message).toBe('validation-failed')
    // The reason phrase survives an escaped throw untouched, so the tag must
    // never ride it.
    expect(error.statusMessage).toBeUndefined()
    // Left alone, so the production serializer keeps `data`.
    expect(error).toMatchObject({ fatal: false, unhandled: false })
  })

  it('carries the issues at data.issues and inside the known-error marker', () => {
    // `toEqual`, so an extra key in either place is a failure: `data.issues`
    // is what a stripped response keeps, the marker is the first-party wire.
    expect(error.data).toEqual({
      issues,
      [KNOWN_ERROR_KEY]: { tag: 'validation-failed', status: 400, issues },
    })
  })

  it('shares no issue object between the two copies and the hook’s input', () => {
    const data = error.data

    expect(data?.issues).not.toBe(issues)
    expect(data?.[KNOWN_ERROR_KEY].issues).not.toBe(issues)
    expect(data?.issues).not.toBe(data?.[KNOWN_ERROR_KEY].issues)
  })

  it('answers both parents’ recognizers and both markers', () => {
    expect(readFloor(error)).toEqual({
      tag: 'validation-failed',
      status: 400,
      issues,
    })
    expect(readValidationMarker(error)).toEqual({ issues })

    expect(recognizeKnownError(error)).toEqual({
      tag: 'validation-failed',
      status: 400,
      issues,
    })
    expect(recognizeValidationError(error)).toEqual({ issues })
  })

  it('keeps the validation marker off the enumerable surface', () => {
    // Non-enumerable and symbol-keyed, so it survives none of the copies the
    // error takes on its way out - the parent's rule, inherited.
    expect(Object.keys(error)).not.toContain(VALIDATION_ERROR_KEY.description)
    expect(JSON.stringify(error)).not.toContain('nuxt-handler-validation:error')
  })

  it('raises the unparseable-body case as the same variant with the parent’s issue', () => {
    const unparseable: ValidationIssue[] = [
      { source: 'body', message: 'Request body could not be parsed', path: [] },
    ]

    const bodyError = validationFailedError(unparseable)

    expect(bodyError.statusCode).toBe(400)
    expect(bodyError.message).toBe('validation-failed')
    expect(bodyError.data).toEqual({
      issues: unparseable,
      [KNOWN_ERROR_KEY]: {
        tag: 'validation-failed',
        status: 400,
        issues: unparseable,
      },
    })
    expect(recognizeValidationError(bodyError)).toEqual({ issues: unparseable })
  })
})
