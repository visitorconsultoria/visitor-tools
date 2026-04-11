import { useMemo, useState, type ChangeEvent } from 'react'
import * as XLSX from 'xlsx'
import { apiUrl } from '../lib/api'

type SqlValue = string | number | null

type SourceTable = {
  name: string
  columns: string[]
  rows: SqlValue[][]
}

type ConversionResult = {
  fileName: string
  outputName: string
  status: 'ok' | 'error'
  detail: string
  sourceTableCount?: number
  rowCount?: number
}

const MAX_PREVIEW_ROWS = 8
const DICTIONARY_FIELD_COLUMN = 'X3_CAMPO'
const DICTIONARY_TYPE_COLUMN = 'X3_TIPO'
const DICTIONARY_SYNC_CHUNK_SIZE = 500

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '')
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()
const SUPABASE_DICTIONARY_TABLE = String(import.meta.env.VITE_SUPABASE_DATA_DICTIONARY_TABLE || 'data_dictionary').trim()

function withBaseUrl(fileName: string): string {
  const baseUrl = String(import.meta.env.BASE_URL || '/').trim()
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${normalizedBase}${fileName.replace(/^\/+/, '')}`
}

const DEFAULT_PUBLIC_DICTIONARY_PATHS = ['dicionario.xlsx', 'dicionario.xls', 'dicionario-padrao.csv'].map(withBaseUrl)

type FieldTypeMap = Map<string, string>

type DataDictionarySyncItem = {
  fieldName: string
  fieldType: string
}

type ResolvedDictionary = {
  map: FieldTypeMap
  source: 'file' | 'supabase' | 'supabase-direct' | 'public'
}

function sanitizeIdentifier(input: string, fallback: string): string {
  const ascii = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  const withPrefix = /^[0-9]/.test(ascii) ? `t_${ascii}` : ascii
  return withPrefix || fallback
}

function uniqueNames(values: string[], fallbackPrefix: string): string[] {
  const used = new Map<string, number>()

  return values.map((value, index) => {
    const base = sanitizeIdentifier(value, `${fallbackPrefix}_${index + 1}`)
    const counter = used.get(base) ?? 0
    used.set(base, counter + 1)
    return counter === 0 ? base : `${base}_${counter + 1}`
  })
}

function toSqlValue(input: unknown): SqlValue {
  if (input === null || input === undefined) return null

  if (typeof input === 'number') {
    return Number.isFinite(input) ? input : null
  }

  if (typeof input === 'boolean') {
    return input ? 1 : 0
  }

  const text = String(input).trim()
  if (!text.length) return null

  const normalized = text.replace(',', '.')
  if (/^-?\d+$/.test(normalized)) {
    const parsedInt = Number.parseInt(normalized, 10)
    return Number.isFinite(parsedInt) ? parsedInt : text
  }

  if (/^-?\d*\.\d+$/.test(normalized)) {
    const parsedFloat = Number.parseFloat(normalized)
    return Number.isFinite(parsedFloat) ? parsedFloat : text
  }

  return text
}

function escapeSqlIdentifier(identifier: string): string {
  return `[${identifier.replace(/]/g, ']]')}]`
}

function escapeSqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

function normalizeFieldName(value: string): string {
  return String(value ?? '').trim().toUpperCase()
}

function normalizeDictionaryKey(value: string): string {
  return normalizeFieldName(sanitizeIdentifier(normalizeFieldName(value), ''))
}

function toSqlLiteral(value: SqlValue): string {
  if (value === null) return "''"
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : "''"
  return escapeSqlString(value)
}

function toYyyyMmDd(value: SqlValue): string | null {
  if (value === null) return null

  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      const numericText = String(Math.trunc(value))
      if (/^\d{8}$/.test(numericText)) return numericText

      const parsedDate = XLSX.SSF.parse_date_code(value)
      if (parsedDate?.y && parsedDate?.m && parsedDate?.d) {
        const y = String(parsedDate.y).padStart(4, '0')
        const m = String(parsedDate.m).padStart(2, '0')
        const d = String(parsedDate.d).padStart(2, '0')
        return `${y}${m}${d}`
      }
    }
    return null
  }

  const text = String(value).trim()
  if (!text) return null

  if (/^\d{8}$/.test(text)) return text

  const ddMmYyyy = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (ddMmYyyy) {
    const [, dd, mm, yyyy] = ddMmYyyy
    return `${yyyy}${mm}${dd}`
  }

  const yyyyMmDd = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (yyyyMmDd) {
    const [, yyyy, mm, dd] = yyyyMmDd
    return `${yyyy}${mm}${dd}`
  }

  const ddMmYyyyDash = text.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (ddMmYyyyDash) {
    const [, dd, mm, yyyy] = ddMmYyyyDash
    return `${yyyy}${mm}${dd}`
  }

  return null
}

function toNumericValue(value: SqlValue): number | null {
  if (value === null) return null

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }

  const text = String(value).trim()
  if (!text) return null

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    const parsed = Number.parseFloat(text)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (/^-?\d+(,\d+)?$/.test(text)) {
    const parsed = Number.parseFloat(text.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : null
  }

  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(text)) {
    const normalized = text.replace(/\./g, '').replace(',', '.')
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) {
    const normalized = text.replace(/,/g, '')
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  return null
}

function toLogicalBit(value: SqlValue): 0 | 1 | null {
  if (value === null) return null

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null
    return value === 0 ? 0 : 1
  }

  const text = String(value).trim().toUpperCase()
  if (!text) return null

  if (['1', 'T', 'TRUE', 'Y', 'YES', 'S', 'SIM'].includes(text)) return 1
  if (['0', 'F', 'FALSE', 'N', 'NO', 'NAO'].includes(text)) return 0
  return null
}

function toSqlLiteralByType(value: SqlValue, fieldType?: string): string {
  const normalizedType = String(fieldType ?? '').trim().toUpperCase()

  if (!normalizedType) return toSqlLiteral(value)
  if (value === null) return "''"

  if (normalizedType === 'C') {
    return escapeSqlString(String(value))
  }

  if (normalizedType === 'M') {
    return escapeSqlString(String(value))
  }

  if (normalizedType === 'D') {
    const yyyymmdd = toYyyyMmDd(value)
    return yyyymmdd ? escapeSqlString(yyyymmdd) : "''"
  }

  if (['N', 'R', 'I', 'B'].includes(normalizedType)) {
    const numeric = toNumericValue(value)
    return numeric === null ? "''" : String(numeric)
  }

  if (normalizedType === 'L') {
    const logical = toLogicalBit(value)
    return logical === null ? "''" : String(logical)
  }

  return toSqlLiteral(value)
}

function parseSourceMatrix(file: File): Promise<unknown[][]> {
  const lowerName = file.name.toLowerCase()

  if (lowerName.endsWith('.csv')) {
    return file.text().then((text) => parseCsv(text))
  }

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    return file.arrayBuffer().then((arrayBuffer) => {
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName]
        if (!worksheet) continue

        const matrix = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: true,
        }) as unknown[][]

        if (matrix.length) return matrix
      }

      return []
    })
  }

  throw new Error('Formato de dicionario nao suportado. Use CSV, XLSX ou XLS.')
}

function matrixToFieldTypeDictionary(matrix: unknown[][]): FieldTypeMap {
  const safeRows = matrix.filter((row) => Array.isArray(row)) as unknown[][]

  if (!safeRows.length) {
    throw new Error('Dicionario vazio ou invalido.')
  }

  let headerRowIndex = -1
  let fieldIndex = -1
  let typeIndex = -1

  for (let rowIndex = 0; rowIndex < safeRows.length; rowIndex += 1) {
    const normalizedHeader = (safeRows[rowIndex] as unknown[]).map((value) => normalizeFieldName(String(value ?? '')))
    const maybeFieldIndex = normalizedHeader.findIndex((value) => value === DICTIONARY_FIELD_COLUMN)
    const maybeTypeIndex = normalizedHeader.findIndex((value) => value === DICTIONARY_TYPE_COLUMN)

    if (maybeFieldIndex >= 0 && maybeTypeIndex >= 0) {
      headerRowIndex = rowIndex
      fieldIndex = maybeFieldIndex
      typeIndex = maybeTypeIndex
      break
    }
  }

  if (fieldIndex < 0 || typeIndex < 0) {
    throw new Error('O dicionario deve conter as colunas X3_CAMPO e X3_TIPO.')
  }

  const map: FieldTypeMap = new Map()
  for (let rowIndex = headerRowIndex + 1; rowIndex < safeRows.length; rowIndex += 1) {
    const row = safeRows[rowIndex]
    const safeRow = Array.isArray(row) ? row : []
    const field = normalizeFieldName(String(safeRow[fieldIndex] ?? ''))
    const type = normalizeFieldName(String(safeRow[typeIndex] ?? ''))
    if (!field || !type) continue
    map.set(field, type)
    const sanitizedField = normalizeDictionaryKey(field)
    if (sanitizedField && sanitizedField !== field) {
      map.set(sanitizedField, type)
    }
  }

  if (!map.size) {
    throw new Error('Nenhum mapeamento valido de X3_CAMPO/X3_TIPO foi encontrado no dicionario.')
  }

  return map
}

function readFieldTypeDictionary(file: File): Promise<FieldTypeMap> {
  return parseSourceMatrix(file).then(matrixToFieldTypeDictionary)
}

async function readFieldTypeDictionaryFromApi(): Promise<FieldTypeMap> {
  const response = await fetch(apiUrl('/api/data-dictionary'))
  const payload = await response.json().catch(() => ({}))

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        'Rota do dicionario nao encontrada na API (HTTP 404). Reinicie/publice a API com o server.mjs atualizado ou selecione manualmente o arquivo de dicionario.',
      )
    }
    const detail = typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`
    throw new Error(detail)
  }

  const items = Array.isArray(payload?.items) ? payload.items : []
  const map: FieldTypeMap = new Map()

  for (const item of items) {
    const field = normalizeFieldName(String(item?.fieldName ?? item?.field_name ?? ''))
    const type = normalizeFieldName(String(item?.fieldType ?? item?.field_type ?? ''))
    if (!field || !type) continue
    map.set(field, type)
    const sanitizedField = normalizeDictionaryKey(field)
    if (sanitizedField && sanitizedField !== field) {
      map.set(sanitizedField, type)
    }
  }

  if (!map.size) {
    throw new Error('Nenhum dicionario encontrado no Supabase. Selecione um arquivo de dicionario para sincronizar.')
  }

  return map
}

async function readFieldTypeDictionaryFromSupabaseDirect(): Promise<FieldTypeMap> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_DICTIONARY_TABLE) {
    throw new Error('Fallback direto no Supabase indisponivel: configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  }

  const pageSize = 1000
  let offset = 0
  const rows: Array<{ field_name?: string, field_type?: string }> = []

  while (true) {
    const url = `${SUPABASE_URL}/rest/v1/${encodeURIComponent(SUPABASE_DICTIONARY_TABLE)}?select=field_name,field_type&order=field_name.asc&limit=${pageSize}&offset=${offset}`
    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    })

    const payload = await response.json().catch(() => ([]))
    if (!response.ok) {
      const detail = typeof payload?.message === 'string' ? payload.message : `HTTP ${response.status}`
      throw new Error(`Falha ao consultar dicionario no Supabase direto: ${detail}`)
    }

    const batch = Array.isArray(payload) ? payload : []
    rows.push(...batch)

    if (batch.length < pageSize) break
    offset += pageSize
  }

  const map: FieldTypeMap = new Map()
  for (const row of rows) {
    const field = normalizeFieldName(String(row?.field_name ?? ''))
    const type = normalizeFieldName(String(row?.field_type ?? ''))
    if (!field || !type) continue
    map.set(field, type)
    const sanitizedField = normalizeDictionaryKey(field)
    if (sanitizedField && sanitizedField !== field) {
      map.set(sanitizedField, type)
    }
  }

  if (!map.size) {
    throw new Error('Nenhum dicionario encontrado no Supabase (consulta direta).')
  }

  return map
}

async function readFieldTypeDictionaryFromPublic(): Promise<FieldTypeMap> {
  for (const path of DEFAULT_PUBLIC_DICTIONARY_PATHS) {
    const response = await fetch(path, { cache: 'no-store' })
    if (!response.ok) continue

    const contentType = String(response.headers.get('content-type') || '').toLowerCase()
    if (contentType.includes('text/html')) continue

    const normalizedPath = path.toLowerCase()
    if (normalizedPath.endsWith('.xlsx') || normalizedPath.endsWith('.xls')) {
      let workbook: XLSX.WorkBook
      try {
        const arrayBuffer = await response.arrayBuffer()
        workbook = XLSX.read(arrayBuffer, { type: 'array' })
      } catch {
        continue
      }

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName]
        if (!worksheet) continue

        const matrix = XLSX.utils.sheet_to_json(worksheet, {
          header: 1,
          raw: true,
        }) as unknown[][]

        if (!matrix.length) continue
        return matrixToFieldTypeDictionary(matrix)
      }

      continue
    }

    const text = await response.text()
    if (/^\s*<!doctype html|^\s*<html/i.test(text)) continue
    const matrix = parseCsv(text)
    if (!matrix.length) continue
    return matrixToFieldTypeDictionary(matrix)
  }

  throw new Error(
    `Nao foi possivel carregar dicionario em public. Caminhos testados: ${DEFAULT_PUBLIC_DICTIONARY_PATHS.join(', ')}.`,
  )
}

async function resolveFieldTypeDictionary(dictionaryFile: File | null): Promise<ResolvedDictionary> {
  if (dictionaryFile) {
    return {
      map: await readFieldTypeDictionary(dictionaryFile),
      source: 'file',
    }
  }

  try {
    return {
      map: await readFieldTypeDictionaryFromApi(),
      source: 'supabase',
    }
  } catch (error) {
    try {
      return {
        map: await readFieldTypeDictionaryFromSupabaseDirect(),
        source: 'supabase-direct',
      }
    } catch {
      const detail = error instanceof Error ? error.message : ''
      if (!/HTTP 404/i.test(detail)) {
        throw error
      }

      return {
        map: await readFieldTypeDictionaryFromPublic(),
        source: 'public',
      }
    }
  }
}

function getMissingDictionaryFields(tables: SourceTable[], fieldTypeMap: FieldTypeMap): string[] {
  const missing = new Set<string>()

  for (const table of tables) {
    for (const column of table.columns) {
      const normalized = normalizeFieldName(column)
      if (!normalized || normalized === 'R_E_C_N_O_') continue
      if (!fieldTypeMap.has(normalized)) {
        missing.add(normalized)
      }
    }
  }

  return Array.from(missing).sort()
}

function getMatchedDictionaryFieldCount(tables: SourceTable[], fieldTypeMap: FieldTypeMap): number {
  let matched = 0

  for (const table of tables) {
    for (const column of table.columns) {
      const normalized = normalizeFieldName(column)
      if (!normalized || normalized === 'R_E_C_N_O_') continue

      if (resolveFieldTypeForColumn(column, fieldTypeMap)) {
        matched += 1
      }
    }
  }

  return matched
}

function resolveFieldTypeForColumn(column: string, fieldTypeMap: FieldTypeMap): string | undefined {
  const normalized = normalizeFieldName(column)
  if (!normalized || normalized === 'R_E_C_N_O_') return undefined

  const sanitized = normalizeDictionaryKey(column)
  const direct = fieldTypeMap.get(normalized) ?? (sanitized ? fieldTypeMap.get(sanitized) : undefined)
  if (direct) return direct

  // Heuristica: permite casar colunas como CODPROD com chaves de dicionario como A1_CODPROD.
  const suffix = `_${normalized}`
  const matchedTypes = new Set<string>()
  for (const [key, type] of fieldTypeMap.entries()) {
    if (key.endsWith(suffix)) {
      matchedTypes.add(type)
    }
  }

  if (matchedTypes.size === 1) {
    return Array.from(matchedTypes)[0]
  }

  return undefined
}

async function syncDataDictionaryToApi(sourceFileName: string, fieldTypeMap: FieldTypeMap): Promise<number> {
  const items: DataDictionarySyncItem[] = Array.from(fieldTypeMap.entries()).map(([fieldName, fieldType]) => ({
    fieldName,
    fieldType,
  }))

  let totalSynced = 0

  for (let index = 0; index < items.length; index += DICTIONARY_SYNC_CHUNK_SIZE) {
    const chunk = items.slice(index, index + DICTIONARY_SYNC_CHUNK_SIZE)
    const response = await fetch(apiUrl('/api/data-dictionary/sync'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sourceFileName,
        replaceAll: index === 0,
        items: chunk,
      }),
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(
          'Endpoint de sincronizacao nao encontrado (HTTP 404). Configure VITE_API_BASE_URL para a API correta ou execute frontend + API juntos.',
        )
      }
      const detail = typeof payload?.error === 'string' ? payload.error : `HTTP ${response.status}`
      throw new Error(detail)
    }

    totalSynced += Number(payload?.count ?? chunk.length)
  }

  return totalSynced
}

function detectCsvDelimiter(text: string): ';' | ',' {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? ''
  const semicolonCount = (firstLine.match(/;/g) ?? []).length
  const commaCount = (firstLine.match(/,/g) ?? []).length
  return semicolonCount >= commaCount ? ';' : ','
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false
  const delimiter = detectCsvDelimiter(text)

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    const next = text[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && (char === delimiter || char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') i += 1
      current.push(field)
      field = ''

      if (char === '\n' || char === '\r') {
        rows.push(current)
        current = []
      }
      continue
    }

    field += char
  }

  if (field.length > 0 || current.length > 0) {
    current.push(field)
    rows.push(current)
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0))
}

function rowsToTable(tableName: string, matrix: unknown[][]): SourceTable {
  const safeRows = matrix.filter((row) => Array.isArray(row))
  const [headerRow = [], ...rawRows] = safeRows

  const originalColumns = headerRow.map((value, index) => {
    const text = String(value ?? '').trim()
    return text || `coluna_${index + 1}`
  })

  const columns = uniqueNames(originalColumns, 'coluna')

  const rows = rawRows.map((row) =>
    columns.map((_, index) => {
      const rawValue = (row as unknown[])[index]
      return toSqlValue(rawValue)
    }),
  )

  return {
    name: sanitizeIdentifier(tableName, 'dados'),
    columns,
    rows,
  }
}

async function readSourceFile(file: File): Promise<SourceTable[]> {
  const lowerName = file.name.toLowerCase()

  if (lowerName.endsWith('.csv')) {
    const text = await file.text()
    const matrix = parseCsv(text)
    if (!matrix.length) {
      throw new Error('CSV vazio ou invalido.')
    }

    const baseName = file.name.replace(/\.csv$/i, '')
    return [rowsToTable(baseName, matrix)]
  }

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })

    const sheetNames = workbook.SheetNames
    if (!sheetNames.length) {
      throw new Error('Nenhuma aba encontrada no arquivo Excel.')
    }

    const tables: SourceTable[] = []
    for (const sheetName of sheetNames) {
      const worksheet = workbook.Sheets[sheetName]
      if (!worksheet) continue

      const matrix = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        raw: true,
      }) as unknown[][]

      if (!matrix.length) continue
      tables.push(rowsToTable(sheetName, matrix))
    }

    if (!tables.length) {
      throw new Error('As abas do Excel nao possuem dados validos.')
    }

    return tables
  }

  throw new Error('Formato nao suportado. Use CSV, XLSX ou XLS.')
}

function buildInsertScript(
  tables: SourceTable[],
  targetTable: string,
  recnoStart: number,
  fieldTypeMap: FieldTypeMap,
): string {
  const allColumns = uniqueNames(
    Array.from(new Set(tables.flatMap((table) => table.columns))),
    'coluna',
  )

  const hasRecno = allColumns.some((column) => column.toUpperCase() === 'R_E_C_N_O_')
  const orderedColumns = hasRecno ? allColumns : [...allColumns, 'R_E_C_N_O_']
  const recnoColumnIndex = orderedColumns.findIndex((column) => column.toUpperCase() === 'R_E_C_N_O_')

  const header = [
    '-- Script gerado automaticamente pelo Visitor Tools',
    `-- Tabela destino: ${targetTable}`,
    `-- Registros origem: ${tables.reduce((sum, table) => sum + table.rows.length, 0)}`,
    `-- R_E_C_N_O_ inicial informado: ${recnoStart}`,
    '',
    'BEGIN TRANSACTION;',
    '',
  ]

  const lines: string[] = []
  let recno = recnoStart
  const fieldTypeCache = new Map<string, string | undefined>()

  for (const sourceTable of tables) {
    const sourceIndexByColumn = new Map<string, number>()
    sourceTable.columns.forEach((column, index) => {
      sourceIndexByColumn.set(column, index)
    })

    lines.push(`-- Origem: ${sourceTable.name}`)

    for (const row of sourceTable.rows) {
      recno += 1

      const values = orderedColumns.map((column, orderedIndex) => {
        if (orderedIndex === recnoColumnIndex) return String(recno)
        const sourceIndex = sourceIndexByColumn.get(column)
        if (sourceIndex === undefined) return "''"
        const cached = fieldTypeCache.get(column)
        const fieldType = cached !== undefined ? cached : resolveFieldTypeForColumn(column, fieldTypeMap)
        if (!fieldTypeCache.has(column)) {
          fieldTypeCache.set(column, fieldType)
        }
        return toSqlLiteralByType(row[sourceIndex] ?? null, fieldType)
      })

      lines.push(
        `INSERT INTO ${escapeSqlIdentifier(targetTable)} (${orderedColumns.map(escapeSqlIdentifier).join(', ')}) VALUES (${values.join(', ')});`,
      )
    }

    lines.push('')
  }

  const footer = ['COMMIT;', '']
  return [...header, ...lines, ...footer].join('\n')
}

function downloadText(fileName: string, content: string): void {
  const blob = new Blob([content], { type: 'text/sql;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export default function ExcelCsvToSqliteTool() {
  const [files, setFiles] = useState<File[]>([])
  const [dictionaryFile, setDictionaryFile] = useState<File | null>(null)
  const [isConverting, setIsConverting] = useState(false)
  const [results, setResults] = useState<ConversionResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dictionarySyncInfo, setDictionarySyncInfo] = useState<string | null>(null)
  const [targetTableName, setTargetTableName] = useState('SR4020')
  const [lastRecno, setLastRecno] = useState('0')

  const totalSelectedSizeMb = useMemo(() => {
    if (!files.length) return 0
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
    return Number((totalBytes / (1024 * 1024)).toFixed(2))
  }, [files])

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files ? Array.from(event.target.files) : []
    setFiles(selected)
    setResults([])
    setError(null)
  }

  const handleDictionaryChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null
    setDictionaryFile(selected)
    setResults([])
    setError(null)

    if (!selected) {
      setDictionarySyncInfo(null)
      return
    }

    try {
      const fieldTypeMap = await readFieldTypeDictionary(selected)
      const count = await syncDataDictionaryToApi(selected.name, fieldTypeMap)
      setDictionarySyncInfo(`Dicionario sincronizado no Supabase com ${count} campo(s).`)
    } catch (syncError) {
      const detail = syncError instanceof Error ? syncError.message : 'Falha ao sincronizar dicionario.'
      if (/HTTP 404/i.test(detail)) {
        setDictionarySyncInfo(
          'Dicionario carregado para geracao SQL, mas a sincronizacao no Supabase nao foi realizada (API nao encontrada).',
        )
        setError(null)
      } else {
        setDictionarySyncInfo(null)
        setError(detail)
      }
    }
  }

  const handleConvert = async () => {
    if (!files.length) {
      setError('Selecione ao menos um arquivo CSV, XLSX ou XLS.')
      return
    }

    const targetTable = sanitizeIdentifier(targetTableName.trim().toUpperCase(), '')
    if (!targetTable) {
      setError('Informe a tabela de destino para insercao, por exemplo SR4020.')
      return
    }

    if (!/^\d+$/.test(lastRecno.trim())) {
      setError('Informe um valor numerico valido para o ultimo R_E_C_N_O_.')
      return
    }

    const initialRecno = Number.parseInt(lastRecno.trim(), 10)

    setError(null)
    setResults([])
    setIsConverting(true)

    const nextResults: ConversionResult[] = []

    try {
      const resolvedDictionary = await resolveFieldTypeDictionary(dictionaryFile)
      const fieldTypeMap = resolvedDictionary.map

      for (const file of files) {
        try {
          const tables = await readSourceFile(file)
          let warningDetail = ''

          const matchedFields = getMatchedDictionaryFieldCount(tables, fieldTypeMap)
          if (matchedFields === 0) {
            warningDetail = ' Nenhum campo da origem foi casado com o dicionario; os valores foram gerados sem tipagem por X3_TIPO. Selecione o arquivo atualizado do dicionario ou revise o cabecalho da planilha.'
          }

          if (resolvedDictionary.source === 'supabase') {
            const missingFields = getMissingDictionaryFields(tables, fieldTypeMap)
            if (missingFields.length) {
              const preview = missingFields.slice(0, 10).join(', ')
              const suffix = missingFields.length > 10 ? ` (+${missingFields.length - 10})` : ''
              warningDetail = ` Dicionário da base incompleto para: ${preview}${suffix}. Para tipagem completa, selecione o arquivo atualizado do dicionário.`
            }
          }

          const script = buildInsertScript(tables, targetTable, initialRecno, fieldTypeMap)
          const outputName = `${file.name.replace(/\.[^.]+$/, '')}-${targetTable.toLowerCase()}.sql`
          downloadText(outputName, script)

          const rowCount = tables.reduce((sum, table) => sum + table.rows.length, 0)
          nextResults.push({
            fileName: file.name,
            outputName,
            status: 'ok',
            detail: `Script SQL gerado e download iniciado.${warningDetail}`,
            sourceTableCount: tables.length,
            rowCount,
          })
        } catch (conversionError) {
          const detail = conversionError instanceof Error ? conversionError.message : 'Falha durante a conversao.'
          nextResults.push({
            fileName: file.name,
            outputName: '',
            status: 'error',
            detail,
          })
        }
      }
    } catch (conversionSetupError) {
      const detail = conversionSetupError instanceof Error
        ? conversionSetupError.message
        : 'Falha ao preparar a conversao do SQL.'
      setError(detail)
    } finally {
      setResults(nextResults)
      setIsConverting(false)
    }
  }

  const previewFiles = files.slice(0, MAX_PREVIEW_ROWS)

  return (
    <div className="grid">
      <section className="card">
        <h2>1) Selecionar arquivos de origem</h2>
        <label className="file-input">
          <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" multiple onChange={handleFileChange} />
          <span>Selecionar arquivos</span>
        </label>
        <p className="muted">
          {files.length
            ? `${files.length} arquivo(s) selecionado(s) • ${totalSelectedSizeMb} MB`
            : 'Nenhum arquivo selecionado.'}
        </p>
        <p className="muted">
          Cada arquivo gera um script SQL com INSERTs. Em Excel com varias abas, todos os dados sao consolidados no mesmo script.
        </p>
        <label className="file-input" style={{ marginTop: '0.75rem' }}>
          <input type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleDictionaryChange} />
          <span>Selecionar dicionário</span>
        </label>
        <p className="muted">
          {dictionaryFile
            ? `Dicionário selecionado: ${dictionaryFile.name}`
            : 'Nenhum dicionário selecionado. Será utilizado o dicionário já salvo na base de dados.'}
        </p>
        {dictionarySyncInfo && <p className="success">{dictionarySyncInfo}</p>}
      </section>

      <section className="card">
        <h2>2) Gerar query SQL de insercao</h2>
        <div className="csv-options">
          <label>
            Tabela de destino (ex.: SR4020)
            <input
              type="text"
              value={targetTableName}
              onChange={(event) => setTargetTableName(event.target.value.toUpperCase())}
              placeholder="SR4020"
            />
          </label>
          <label>
            Ultimo R_E_C_N_O_ existente
            <input
              type="number"
              min={0}
              value={lastRecno}
              onChange={(event) => setLastRecno(event.target.value)}
              placeholder="0"
            />
          </label>
        </div>
        <p className="muted">
          Para obter o último R_E_C_N_O_, na sua aplicação de banco de dados ou no Query Analyzer da APSDU execute: SELECT MAX(R_E_C_N_O_) FROM {escapeSqlIdentifier(sanitizeIdentifier(targetTableName.trim().toUpperCase(), 'SR4020'))};
        </p>
        <div className="controls">
          <button type="button" className="button-primary" onClick={() => void handleConvert()} disabled={isConverting || !files.length}>
            {isConverting ? 'Gerando SQL...' : 'Gerar arquivo .sql'}
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        {!!files.length && (
          <div className="results">
            <h3 style={{ margin: 0 }}>Arquivos selecionados</h3>
            <ul>
              {previewFiles.map((file) => (
                <li key={`${file.name}-${file.size}`}>
                  <span>{file.name}</span>
                  <span className="muted">{(file.size / 1024).toFixed(1)} KB</span>
                </li>
              ))}
            </ul>
            {files.length > MAX_PREVIEW_ROWS && (
              <p className="muted">Pre-visualizacao limitada a {MAX_PREVIEW_ROWS} arquivos.</p>
            )}
          </div>
        )}

        {!!results.length && (
          <div className="results" style={{ marginTop: '1rem' }}>
            <h3 style={{ margin: 0 }}>Resultado da conversao</h3>
            <ul>
              {results.map((result) => (
                <li key={`${result.fileName}-${result.outputName || 'erro'}`}>
                  <span style={{ fontWeight: 700 }}>{result.fileName}</span>
                  <span className={result.status === 'ok' ? 'success' : 'error'}>
                    {result.status === 'ok' ? 'Concluido' : 'Erro'}
                  </span>
                  <span className="muted">{result.detail}</span>
                  {result.status === 'ok' && (
                    <span className="muted">
                      {result.sourceTableCount} aba(s)/origem(ns), {result.rowCount} linha(s) para {result.outputName}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}
