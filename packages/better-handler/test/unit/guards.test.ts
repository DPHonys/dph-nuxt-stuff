import type { StandardSchemaV1 } from '@standard-schema/spec'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  isFunction,
  isRecordLike,
  isStandardSchema,
  isString,
} from '../../src/runtime/shared/guards'

const validate: StandardSchemaV1.Props['validate'] = (value) => ({ value })

describe('isStandardSchema', () => {
  it.each([
    ['a zod schema', z.object({ id: z.number() })],
    [
      'a hand-written schema',
      { '~standard': { version: 1, vendor: 'x', validate } },
    ],
    [
      'a callable host',
      Object.assign(() => {}, {
        '~standard': { version: 1, vendor: 'x', validate },
      }),
    ],
  ])('accepts %s', (_name, value) => {
    expect(isStandardSchema(value)).toBe(true)
  })

  it.each([
    [
      'a version other than 1',
      { '~standard': { version: 2, vendor: 'x', validate } },
    ],
    [
      'a validate that is not a function',
      { '~standard': { version: 1, validate: 'no' } },
    ],
    ['a ~standard that is not an object', { '~standard': 1 }],
    ['no ~standard at all', { validate }],
    ['null', null],
    ['a string', '~standard'],
  ])('refuses %s', (_name, value) => {
    expect(isStandardSchema(value)).toBe(false)
  })
})

describe('the shape guards', () => {
  class Order {
    readonly id = 1
  }

  it.each([
    [{}, true],
    [Object.create(null), true],
    [new Order(), true],
    [new Date(0), true],
    [[], false],
    [() => {}, false],
    [null, false],
    ['text', false],
  ])('reads %o as record-like: %s', (value, recordLike) => {
    expect(isRecordLike(value)).toBe(recordLike)
  })

  it('tells strings and functions by typeof', () => {
    expect([
      isString('x'),
      isString(1),
      isFunction(() => {}),
      isFunction({}),
    ]).toEqual([true, false, true, false])
  })
})
