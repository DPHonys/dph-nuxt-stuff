// PROTOTYPE. Passes anything through, so a fixture app can boot.
export function schema() {
  return {
    '~standard': {
      version: 1,
      vendor: 'prototype',
      validate: (value) => ({ value }),
    },
  }
}
