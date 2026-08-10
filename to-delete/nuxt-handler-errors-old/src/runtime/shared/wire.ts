/**
 * The wire protocol, alone in a file because both directions depend on it and
 * neither owns it: `./errors` writes this key, `./reader` reads it.
 */

/**
 * The reserved key a declared failure travels under, inside the error body's
 * `data`. Frozen wire protocol: its presence *is* the evidence the server
 * declared this failure, its value *is* the variant, and versioning is by key
 * rename. Deliberately does not track the package name.
 */
export const DECLARED_ERROR_KEY = '__declaredError__'
