import { defineEventHandler } from 'h3'
import { observed } from '../utils/observed'

export default defineEventHandler(() => observed)
