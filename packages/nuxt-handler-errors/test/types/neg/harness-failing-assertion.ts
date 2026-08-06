/**
 * Deliberately does not compile. Excluded from the package's `tsconfig` and
 * from lint.
 *
 * `Expect` is what turns a type-level claim into a build failure, and its whole
 * mechanism is one constraint. This fixture is the only place in the suite
 * where an assertion is *false*, so it is the only place that can show the
 * constraint biting: without it, `Expect` could be widened to accept anything
 * and every positive fixture would stay green.
 *
 * Asserted: `TS2344`, with a message naming both the claim and the constraint.
 */

import type { Equal, Expect } from '../vocabulary'

type _wrong = Expect<Equal<'a', 'b'>>
