import { fetch, setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The playground's documented requests, answered by a dev server: the build a
// reader runs with `pnpm dev`, where the development checks are on. A route
// docblock promising an answer the checks refuse is a playground that teaches
// the wrong declaration.
describe('the playground, against a dev server', async () => {
  await setup({
    rootDir: fileURLToPath(new URL('../../playground', import.meta.url)),
    server: true,
    browser: false,
    dev: true,
    nuxtConfig: { devtools: { enabled: false } },
  })

  describe('/api/invoices/:id', () => {
    it('answers the invoice for a whole-number id', async () => {
      const response = await fetch('/api/invoices/7')

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ id: 7, total: 42 })
    })

    it('answers validation-failed naming the route source for any other id', async () => {
      const response = await fetch('/api/invoices/seven')

      expect(response.status).toBe(400)
      expect((await response.json()).data).toEqual({
        _tag: 'validation-failed',
        issues: [
          {
            source: 'route',
            message: 'invoice id must be a whole number',
            path: ['id'],
          },
        ],
      })
    })

    it('answers invoice-not-found with the converted id past 100', async () => {
      // The error's fields are the Handler's number, not the route's string:
      // a schema reading the route's input would refuse them as a dev fault.
      const response = await fetch('/api/invoices/404')

      expect(response.status).toBe(404)
      expect((await response.json()).data).toEqual({
        _tag: 'invoice-not-found',
        id: 404,
      })
    })
  })
})
