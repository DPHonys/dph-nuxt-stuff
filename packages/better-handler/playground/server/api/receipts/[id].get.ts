import { invoiceRef, receipt } from '~~/server/io/schemas'

/**
 * `/api/receipts/7` - the bare `output` form: one `200` reply, returned
 * plainly as the schema's input type. The status the Handler sets first
 * does not survive: the bare form answers `200`.
 */
export default defineBetterEventHandler(
  { input: { route: invoiceRef }, output: receipt },
  (event, { route }) => {
    setResponseStatus(event, 202)

    return { id: route.id, total: 42, at: new Date(0).toISOString() }
  }
)
