/**
 * A Tagged error: the value a Known error carries as its `data`, its `_tag`
 * beside the fields its declaration describes. On the server it is read by
 * its tag, as `recognizeKnownError` hands it back; the fields of a route's
 * own variants are typed from that route's declaration.
 */
export interface TaggedError {
  readonly _tag: string
}
