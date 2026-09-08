import { readFile } from 'node:fs/promises'
import { z } from 'zod'

/** The values `JSON.parse` can produce, as zod spells them. */
const JSON_VALUE = z.json()

export type JsonValue = z.infer<typeof JSON_VALUE>

export async function readJson(file: string): Promise<JsonValue> {
  return JSON_VALUE.parse(JSON.parse(await readFile(file, 'utf8')))
}
