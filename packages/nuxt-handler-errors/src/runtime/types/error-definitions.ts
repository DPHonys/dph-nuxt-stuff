import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { H3Error } from 'h3'
import type { ErrorStatus } from './known-error'
import type { IsAny } from './utils'

export type ErrorDefinitions = Record<
  string,
  { readonly status: ErrorStatus; readonly data?: StandardSchemaV1 }
>

export type ErrorsOfDefinitions<D extends ErrorDefinitions> = {
  [K in keyof D & string]: { tag: K; status: D[K]['status'] } & (D[K] extends {
    data: infer S extends StandardSchemaV1
  }
    ? { data: StandardSchemaV1.InferOutput<S> }
    : unknown)
}[keyof D & string]

export type ErrorFactories<D extends ErrorDefinitions> = {
  readonly [K in keyof D]: ((
    ...args: D[K] extends {
      data: infer S extends StandardSchemaV1
    }
      ? [data: StandardSchemaV1.InferInput<S>]
      : []
  ) => H3Error) & { readonly tag: K; readonly status: D[K]['status'] }
}

// Only inspect local schema outputs, not route unions. Bound work for recursive
// schemas; runtime serialization checks values beyond this depth (and `any`).
type JsonOutput<T, Depth extends unknown[] = []> =
  IsAny<T> extends true
    ? true
    : unknown extends T
      ? false
      : T extends string | number | boolean | null
        ? true
        : T extends bigint | symbol | undefined | ((...args: any[]) => any)
          ? false
          : Depth['length'] extends 8
            ? true
            : T extends { toJSON: (...args: any[]) => infer Output }
              ? JsonOutput<Output, [...Depth, unknown]>
              : T extends readonly (infer Item)[]
                ? JsonOutput<Item, [...Depth, unknown]>
                : T extends object
                  ? {
                      [K in keyof T]-?: JsonOutput<
                        Exclude<T[K], undefined>,
                        [...Depth, unknown]
                      >
                    }[keyof T]
                  : false

/** Reject non-string tags, legacy slots and output that cannot survive the wire. */
export type ErrorDefinitionsGuard<D extends ErrorDefinitions> = {
  [K in keyof D]: K extends string
    ? Exclude<keyof D[K], 'status' | 'data'> extends never
      ? D[K] extends { data: infer S extends StandardSchemaV1 }
        ? false extends JsonOutput<StandardSchemaV1.InferOutput<S>>
          ? never
          : unknown
        : unknown
      : never
    : never
}
