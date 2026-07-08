import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { apiUrl } from '../lib/api'
import {
  RUBRICA_RULE_FIELD_DEFINITIONS,
  type RubricaRuleFieldDefinition,
  type RubricaRuleFieldKey,
} from '../lib/rubricaRuleConfig'

type RuleSet = {
  id: number
  name: string
  description: string
}

type RubricaCatalogItem = {
  code: string
  fullDescription: string
}

type RuleRow = {
  id: number
  ruleSetId: number
  sortOrder: number
} & Record<RubricaRuleFieldKey, string>

type ImportedRuleRow = Record<RubricaRuleFieldKey, string> & {
  __rv_cod?: string
}

type FieldDiff = {
  field: RubricaRuleFieldDefinition
  expected: string
  found: string
}

type SpecialReference = {
  field: RubricaRuleFieldDefinition
  referenceCode: string
  referenceRow: Record<RubricaRuleFieldKey, string> | null
  importedReferenceRow: ImportedRuleRow | null
  importedVerbaCode: string
  linkedImportedRow: ImportedRuleRow | null
  divergentFieldKeys: RubricaRuleFieldKey[]
}

type Divergence = {
  rvCodfol: string
  diffs: FieldDiff[]
  ruleRow: Record<RubricaRuleFieldKey, string>
  importedRow: ImportedRuleRow
  specialReferences: SpecialReference[]
}

type ComparisonResult = {
  selectedRuleSetName: string
  selectedComparisonFieldKeys: RubricaRuleFieldKey[]
  totalRuleRows: number
  totalImportedRows: number
  equalRows: number
  divergences: Divergence[]
  missingInImported: string[]
  extraInImported: string[]
  duplicateCodesInImported: string[]
}

const EXCLUDED_FIELDS = new Set<RubricaRuleFieldKey>(['rv_desc', 'rv_descdet'])
const DEFAULT_SELECTED_COMPARISON_FIELDS = new Set<RubricaRuleFieldKey>([
  'rv_codfol',
  'rv_tipo',
  'rv_inss',
  'rv_inssfer',
  'rv_ir',
  'rv_fgts',
  'rv_rra',
  'rv_pis',
  'rv_dirf',
  'rv_ref13',
  'rv_reffer',
  'rv_refabon',
  'rv_adianta',
  'rv_empcons',
  'rv_refplr',
  'rv_naturez',
  'rv_incirf',
  'rv_incfgts',
  'rv_inccp',
  'rv_incop',
  'rv_tetop',
  'rv_incpis',
  'rv_ferxml',
  'rv_feraxml',
])
const SPECIAL_REFERENCE_FIELDS = new Set<RubricaRuleFieldKey>(['rv_ferxml', 'rv_feraxml'])
const SPECIAL_REFERENCE_EXPORT_ORDER: RubricaRuleFieldKey[] = ['rv_ferxml', 'rv_feraxml']
const FIELD_HEADER_ALIASES: Partial<Record<RubricaRuleFieldKey, string[]>> = {
  rv_tipo: ['RV_TIPO'],
  rv_desc: ['DESCRICAO', 'DESCRIÇÃO', 'DESC', 'DESCRICAO DA VERBA', 'DESCRICAO VERBA'],
}
const FIELD_CATALOG_MAP: Partial<Record<RubricaRuleFieldKey, string>> = {
  rv_naturez: 'natureza-rubricas',
  rv_incirf: 'inc-irrf',
  rv_incfgts: 'inc-fgts',
  rv_inccp: 'inc-cp',
  rv_incop: 'inc-rpps',
  rv_incpis: 'inc-pis',
  rv_codfol: 'id-calculo-protheus',
}

type ExcelJSRuntime = {
  Workbook: new () => any
}

let excelJsLoader: Promise<ExcelJSRuntime> | null = null

async function loadExcelJSRuntime(): Promise<ExcelJSRuntime> {
  const browserWindow = window as Window & { ExcelJS?: ExcelJSRuntime }
  if (browserWindow.ExcelJS?.Workbook) {
    return browserWindow.ExcelJS
  }

  if (!excelJsLoader) {
    excelJsLoader = new Promise<ExcelJSRuntime>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'
      script.async = true

      script.onload = () => {
        const loadedRuntime = (window as Window & { ExcelJS?: ExcelJSRuntime }).ExcelJS
        if (!loadedRuntime?.Workbook) {
          reject(new Error('ExcelJS foi carregado, mas não expôs Workbook.'))
          return
        }

        resolve(loadedRuntime)
      }

      script.onerror = () => {
        reject(new Error('Falha ao carregar biblioteca de exportacao (ExcelJS CDN).'))
      }

      document.head.appendChild(script)
    }).catch((error) => {
      excelJsLoader = null
      throw error
    })
  }

  return excelJsLoader
}

function toFriendlyApiError(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

function normalizeHeader(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function mapRuleSetRow(row: unknown): RuleSet {
  const data = row && typeof row === 'object' ? row as Record<string, unknown> : {}
  return {
    id: Number(data.id ?? 0),
    name: String(data.name ?? ''),
    description: String(data.description ?? ''),
  }
}

function mapCatalogItemRow(row: unknown): RubricaCatalogItem {
  const data = row && typeof row === 'object' ? row as Record<string, unknown> : {}
  return {
    code: String(data.code ?? ''),
    fullDescription: String(data.fullDescription ?? data.full_description ?? ''),
  }
}

function mapRuleItemRow(row: unknown): RuleRow {
  const data = row && typeof row === 'object' ? row as Record<string, unknown> : {}
  const fields = {} as Record<RubricaRuleFieldKey, string>

  for (const field of RUBRICA_RULE_FIELD_DEFINITIONS) {
    fields[field.key] = String(data[field.key] ?? '')
  }

  return {
    id: Number(data.id ?? 0),
    ruleSetId: Number(data.ruleSetId ?? data.rule_set_id ?? 0),
    sortOrder: Number(data.sortOrder ?? data.sort_order ?? 0),
    ...fields,
  }
}

async function parseWorkbookRows(
  file: File,
): Promise<ImportedRuleRow[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const preferredSheet = workbook.SheetNames.find((name) => normalizeHeader(name) === 'tabela regra')
  const sheet = workbook.Sheets[preferredSheet || workbook.SheetNames[0]]

  if (!sheet) {
    throw new Error('A planilha nao possui uma aba valida para comparacao.')
  }

  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
  })

  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new Error('A planilha selecionada esta vazia.')
  }

  const headerRow = (matrix[0] || []).map((cell) => normalizeHeader(cell))
  const columnIndexByKey = new Map<RubricaRuleFieldKey, number>()
  const rvCodColumnIndex = headerRow.findIndex((header) => header === normalizeHeader('RV_COD'))

  for (const field of RUBRICA_RULE_FIELD_DEFINITIONS) {
    const acceptedHeaders = [
      normalizeHeader(field.label),
      ...((FIELD_HEADER_ALIASES[field.key] || []).map((alias) => normalizeHeader(alias))),
    ]

    const columnIndex = headerRow.findIndex((header) => acceptedHeaders.includes(header))
    if (columnIndex >= 0) {
      columnIndexByKey.set(field.key, columnIndex)
    }
  }

  if (!columnIndexByKey.has('rv_codfol')) {
    throw new Error('A coluna RV_CODFOL e obrigatoria para a comparacao.')
  }

  return matrix
    .slice(1)
    .map((row) => {
      const parsed = {} as ImportedRuleRow
      for (const field of RUBRICA_RULE_FIELD_DEFINITIONS) {
        const idx = columnIndexByKey.get(field.key)
        parsed[field.key] = idx === undefined ? '' : String(row[idx] ?? '').trim()
      }

      if (rvCodColumnIndex >= 0) {
        parsed.__rv_cod = String(row[rvCodColumnIndex] ?? '').trim()
      }

      return parsed
    })
    .filter((row) => {
      if (String(row.rv_codfol || '').trim()) return true
      return Boolean(extractImportedReferenceCode(row))
    })
}

function normalizeCode(value: string): string {
  const normalized = String(value || '').trim().toUpperCase()
  if (!normalized) return ''

  const numericCodeWithDescription = normalized.match(/^(\d+)\s*[-:]\s+.+$/)
  const rawCode = numericCodeWithDescription ? numericCodeWithDescription[1] : normalized

  const noLeadingZeros = rawCode.replace(/^0+/, '')
  return noLeadingZeros || '0'
}

function normalizeComparableValue(value: string): string {
  const normalized = String(value || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')

  if (!normalized) return ''

  return normalized
}

function normalizeComparablePair(fieldKey: RubricaRuleFieldKey, expectedValue: string, foundValue: string) {
  let expectedComparable = normalizeComparableValue(expectedValue)
  let foundComparable = normalizeComparableValue(foundValue)

  if (fieldKey === 'rv_incpis') {
    if (expectedComparable === '00') expectedComparable = ''
    if (foundComparable === '00') foundComparable = ''
  }

  const normalizeDirfValue = (value: string) => {
    if (value === 'n' || value === 'nao') return ''
    if (value === 's') return 'sim'
    return value
  }

  expectedComparable = normalizeDirfValue(expectedComparable)
  foundComparable = normalizeDirfValue(foundComparable)

  if (fieldKey === 'rv_dirf' && !expectedComparable && !foundComparable) {
    return { expectedComparable: '', foundComparable: '' }
  }

  const expectedIsYesNo = expectedComparable === 'sim' || expectedComparable === 'nao'
  const foundIsYesNo = foundComparable === 'sim' || foundComparable === 'nao'

  if (!expectedComparable && foundIsYesNo) {
    expectedComparable = 'nao'
  }

  if (!foundComparable && expectedIsYesNo) {
    foundComparable = 'nao'
  }

  return { expectedComparable, foundComparable }
}

function normalizeReferenceSuffix(value: string): string {
  const normalized = String(value || '').trim().toUpperCase()
  if (!normalized) return ''

  if (/^\d+$/.test(normalized)) {
    const noLeadingZeros = normalized.replace(/^0+/, '')
    return noLeadingZeros || '0'
  }

  const decimalNumericMatch = normalized.match(/^0*(\d+)(?:[\.,]\d+)?$/)
  if (decimalNumericMatch?.[1]) {
    const noLeadingZeros = decimalNumericMatch[1].replace(/^0+/, '')
    return noLeadingZeros || '0'
  }

  const embeddedNumericMatch = normalized.match(/\b0*(\d+)\b/)
  if (embeddedNumericMatch?.[1]) {
    const noLeadingZeros = embeddedNumericMatch[1].replace(/^0+/, '')
    return noLeadingZeros || '0'
  }

  return normalized
}

function extractImportedReferenceCode(row: ImportedRuleRow): string {
  const explicitCode = normalizeReferenceSuffix(String(row.__rv_cod || ''))
  if (explicitCode) return explicitCode

  const desc = String(row.rv_desc || '').trim().toUpperCase()
  const descCode = desc.match(/^(\d+)\s*[-:|]/)?.[1] || desc.match(/^(\d+)/)?.[1] || desc.match(/\b(\d{1,6})\b/)?.[1] || ''
  return normalizeReferenceSuffix(descCode)
}

function normalizeSpecialReferenceId(value: string): string {
  const normalized = normalizeReferenceSuffix(value)
  if (!normalized) return ''

  if (/^\d+$/.test(normalized)) {
    return normalized.padStart(4, '0')
  }

  return normalized
}

function extractReferenceBindingCode(value: string): string {
  const normalized = String(value || '').trim().toUpperCase()
  if (!normalized) return ''

  const pipeIndex = normalized.lastIndexOf('|')
  if (pipeIndex >= 0) {
    return normalizeCode(normalized.slice(pipeIndex + 1))
  }

  return normalizeCode(normalized)
}

function findSpecialReferenceRuleRow(
  ruleMap: Map<string, Record<RubricaRuleFieldKey, string>>,
  fieldLabel: string,
  originCodeRaw: string,
) {
  const originCode = normalizeSpecialReferenceId(originCodeRaw)
  if (!originCode) return null

  const referenceCodes = new Set<string>([`${fieldLabel}|${originCode}`])

  for (const referenceCode of referenceCodes) {
    const ruleRow = ruleMap.get(normalizeCode(referenceCode))
    if (ruleRow) {
      return {
        referenceCode,
        row: ruleRow,
      }
    }
  }

  return null
}

function buildReferenceDescription(referenceRow: Record<RubricaRuleFieldKey, string> | null, referenceCode: string): string {
  if (!referenceRow) return ''

  const code = String(referenceRow.rv_codfol || '').trim()
  const description = String(referenceRow.rv_desc || '').trim()

  if (code && description) {
    return `${code} - ${description}`
  }

  return description || code || referenceCode
}

function formatReferenceCode(value: string): string {
  const normalized = String(value || '').trim().toUpperCase()
  if (!normalized) return ''

  const pipeIndex = normalized.lastIndexOf('|')
  if (pipeIndex < 0) return normalized

  const prefix = normalized.slice(0, pipeIndex)
  const suffix = normalizeSpecialReferenceId(normalized.slice(pipeIndex + 1))
  return suffix ? `${prefix}|${suffix}` : prefix
}

function mergeReferenceRows(
  importedReferenceRow: ImportedRuleRow | null,
  canonicalReferenceRow: Record<RubricaRuleFieldKey, string> | null,
): Record<RubricaRuleFieldKey, string> | null {
  if (!importedReferenceRow && !canonicalReferenceRow) return null

  const merged = {} as Record<RubricaRuleFieldKey, string>
  for (const field of RUBRICA_RULE_FIELD_DEFINITIONS) {
    const importedValue = String(importedReferenceRow?.[field.key] ?? '').trim()
    const canonicalValue = String(canonicalReferenceRow?.[field.key] ?? '').trim()
    merged[field.key] = importedValue || canonicalValue
  }

  return merged
}

function scoreImportedReferenceRow(row: ImportedRuleRow): number {
  const isReferenceRow = String(row.rv_codfol || '').includes('|')
  let score = isReferenceRow ? 0 : 1000

  for (const field of RUBRICA_RULE_FIELD_DEFINITIONS) {
    if (field.key === 'rv_codfol') continue
    if (String(row[field.key] || '').trim()) {
      score += 1
    }
  }

  if (String(row.__rv_cod || '').trim()) {
    score += 1
  }

  return score
}

function pickBestImportedReferenceRow(
  candidates: ImportedRuleRow[],
  refRow: ImportedRuleRow,
  baseCode: string,
): ImportedRuleRow | null {
  if (!candidates.length) return null

  let best: ImportedRuleRow | null = null
  let bestScore = Number.NEGATIVE_INFINITY

  for (const candidate of candidates) {
    let score = scoreImportedReferenceRow(candidate)
    if (candidate === refRow) {
      score -= 500
    }

    const codfol = String(candidate.rv_codfol || '').trim()
    if (codfol && !codfol.includes('|') && normalizeCode(codfol) === baseCode) {
      score += 200
    }

    if (score > bestScore) {
      best = candidate
      bestScore = score
    }
  }

  return best
}

function sanitizeFileNameSegment(value: string): string {
  const sanitized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return sanitized || 'comparacao-rubricas'
}

function buildRowMap<T extends Record<RubricaRuleFieldKey, string>>(rows: T[]) {
  const map = new Map<string, T>()
  const duplicates = new Set<string>()

  for (const row of rows) {
    const code = normalizeCode(row.rv_codfol)
    if (!code) continue

    if (map.has(code)) {
      duplicates.add(code)
      continue
    }

    map.set(code, row)
  }

  return { map, duplicates: Array.from(duplicates).sort((a, b) => a.localeCompare(b)) }
}

function compareRuleRows(
  ruleRows: RuleRow[],
  importedRows: ImportedRuleRow[],
  ruleSetName: string,
  selectedComparisonFieldKeys: Set<RubricaRuleFieldKey>,
): ComparisonResult {
  const comparableFields = RUBRICA_RULE_FIELD_DEFINITIONS.filter(
    (field) => selectedComparisonFieldKeys.has(field.key) && !EXCLUDED_FIELDS.has(field.key) && field.key !== 'rv_codfol',
  )
  const referenceComparableFields = comparableFields.filter((field) => !SPECIAL_REFERENCE_FIELDS.has(field.key))

  const normalizedRuleRows = ruleRows.map((row) => {
    const normalized = {} as Record<RubricaRuleFieldKey, string>
    for (const field of RUBRICA_RULE_FIELD_DEFINITIONS) {
      normalized[field.key] = String(row[field.key] ?? '').trim()
    }
    return normalized
  })

  const { map: ruleMap } = buildRowMap(normalizedRuleRows)
  const { map: importedMap, duplicates } = buildRowMap(importedRows)
  const importedBaseRowsByCode = new Map<string, ImportedRuleRow>()
  const importedRowsByRvCod = new Map<string, ImportedRuleRow[]>()
  const importedSpecialRowsByBaseCode = new Map<string, ImportedRuleRow[]>()

  for (const row of importedRows) {
    const rvCod = extractImportedReferenceCode(row)
    if (rvCod) {
      const rows = importedRowsByRvCod.get(rvCod) || []
      rows.push(row)
      importedRowsByRvCod.set(rvCod, rows)
    }

    const rvCodFol = String(row.rv_codfol || '').trim()
    if (!rvCodFol) continue

    if (rvCodFol.includes('|')) {
      const baseCode = extractReferenceBindingCode(rvCodFol)
      if (!baseCode) continue

      const rows = importedSpecialRowsByBaseCode.get(baseCode) || []
      rows.push(row)
      importedSpecialRowsByBaseCode.set(baseCode, rows)
      continue
    }

    const baseCode = normalizeCode(rvCodFol)
    if (!baseCode || importedBaseRowsByCode.has(baseCode)) continue
    importedBaseRowsByCode.set(baseCode, row)
  }

  const divergences: Divergence[] = []
  let equalRows = 0

  for (const [code, ruleRow] of ruleMap.entries()) {
    const imported = importedMap.get(code)
    if (!imported) continue

    const diffs: FieldDiff[] = []
    const specialReferenceByField = new Map<RubricaRuleFieldKey, SpecialReference>()
    for (const field of comparableFields) {
      const found = String(imported[field.key] ?? '').trim()

      if (SPECIAL_REFERENCE_FIELDS.has(field.key)) {
        const informedVerba = normalizeReferenceSuffix(found)
        const baseReferenceCode = extractReferenceBindingCode(String(ruleRow.rv_codfol || imported.rv_codfol || code || ''))
        const baseRuleRow = ruleMap.get(baseReferenceCode) || ruleRow
        const defaultReferenceCode = baseReferenceCode ? `${field.label}|${baseReferenceCode}` : field.label
        const referenceMatch = findSpecialReferenceRuleRow(
          ruleMap,
          field.label,
          baseReferenceCode,
        )
        const importedReferenceCandidates = informedVerba ? importedRowsByRvCod.get(informedVerba) || [] : []
        const linkedImportedRow = informedVerba ? importedBaseRowsByCode.get(informedVerba) || null : null
        const importedReferenceRow = pickBestImportedReferenceRow(importedReferenceCandidates, imported, baseReferenceCode)

        if (informedVerba || referenceMatch?.row) {
          specialReferenceByField.set(field.key, {
            field,
            referenceCode: referenceMatch?.referenceCode || defaultReferenceCode,
            referenceRow: referenceMatch?.row || null,
            importedReferenceRow,
            importedVerbaCode: informedVerba,
            linkedImportedRow,
            divergentFieldKeys: [],
          })
        }

        const specialReference = specialReferenceByField.get(field.key)

        if (!referenceMatch?.row) {
          continue
        }

        if (!informedVerba) {
          continue
        }

        if (!linkedImportedRow) {
          continue
        }

        for (const referenceField of referenceComparableFields) {
          const expectedReferenceValue = String(referenceMatch.row?.[referenceField.key] ?? baseRuleRow[referenceField.key] ?? '').trim()
          const foundReferenceValue = String(referenceMatch.row?.[referenceField.key] ?? '').trim()
          const { expectedComparable, foundComparable } = normalizeComparablePair(
            referenceField.key,
            expectedReferenceValue,
            foundReferenceValue,
          )

          if (expectedComparable !== foundComparable) {
            diffs.push({
              field: referenceField,
              expected: expectedReferenceValue,
              found: foundReferenceValue,
            })
            if (specialReference) {
              specialReference.divergentFieldKeys.push(referenceField.key)
            }
          }
        }
        continue
      }

      const expected = String(ruleRow[field.key] ?? '').trim()

      const { expectedComparable, foundComparable } = normalizeComparablePair(field.key, expected, found)

      if (expectedComparable !== foundComparable) {
        diffs.push({
          field,
          expected,
          found,
        })
      }
    }

    const relatedSpecialRows = importedSpecialRowsByBaseCode.get(code) || []
    for (const specialImportedRow of relatedSpecialRows) {
      const specialReferenceCode = String(specialImportedRow.rv_codfol || '').trim().toUpperCase()
      const specialFieldLabel = specialReferenceCode.split('|')[0]?.trim() || ''
      const specialField = RUBRICA_RULE_FIELD_DEFINITIONS.find((field) => field.label === specialFieldLabel)
      if (!specialField) continue
      const referenceMatch = findSpecialReferenceRuleRow(ruleMap, specialField.label, code)

      const specialReference = specialReferenceByField.get(specialField.key) || {
        field: specialField,
        referenceCode: referenceMatch?.referenceCode || specialReferenceCode,
        referenceRow: referenceMatch?.row || null,
        importedReferenceRow: null,
        importedVerbaCode: extractImportedReferenceCode(specialImportedRow),
        linkedImportedRow: imported,
        divergentFieldKeys: [],
      }

      specialReference.referenceCode = referenceMatch?.referenceCode || specialReferenceCode || `${specialField.label}|${code}`
      specialReference.referenceRow = referenceMatch?.row || specialReference.referenceRow
      const importedReferenceCandidates = importedRowsByRvCod.get(extractImportedReferenceCode(specialImportedRow)) || []
      specialReference.importedReferenceRow = pickBestImportedReferenceRow(importedReferenceCandidates, specialImportedRow, code)
        || specialImportedRow
      specialReference.importedVerbaCode = extractImportedReferenceCode(specialImportedRow)
      specialReference.linkedImportedRow = imported
      const resolvedReferenceRow = mergeReferenceRows(specialReference.importedReferenceRow, specialReference.referenceRow)

      for (const referenceField of referenceComparableFields) {
        const expectedReferenceValue = String(specialReference.referenceRow?.[referenceField.key] ?? ruleRow[referenceField.key] ?? '').trim()
        const foundReferenceValue = String((resolvedReferenceRow || specialImportedRow)[referenceField.key] ?? '').trim()
        const { expectedComparable, foundComparable } = normalizeComparablePair(
          referenceField.key,
          expectedReferenceValue,
          foundReferenceValue,
        )

        if (expectedComparable !== foundComparable) {
          specialReference.divergentFieldKeys.push(referenceField.key)
        }
      }

      if (specialReference.divergentFieldKeys.length) {
        specialReferenceByField.set(specialField.key, specialReference)
      }
    }

    if (diffs.length || specialReferenceByField.size) {
      divergences.push({
        rvCodfol: code,
        diffs,
        ruleRow,
        importedRow: imported,
        specialReferences: Array.from(specialReferenceByField.values()),
      })
    } else {
      equalRows += 1
    }
  }

  const missingInImported = Array.from(ruleMap.keys()).filter((code) => !importedMap.has(code)).sort((a, b) => a.localeCompare(b))
  const extraInImported = Array.from(importedMap.keys()).filter((code) => !ruleMap.has(code)).sort((a, b) => a.localeCompare(b))

  return {
    selectedRuleSetName: ruleSetName,
    selectedComparisonFieldKeys: comparableFields.map((field) => field.key),
    totalRuleRows: ruleMap.size,
    totalImportedRows: importedMap.size,
    equalRows,
    divergences: divergences.sort((a, b) => a.rvCodfol.localeCompare(b.rvCodfol)),
    missingInImported,
    extraInImported,
    duplicateCodesInImported: duplicates,
  }
}

export default function RubricaRuleComparisonTool() {
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([])
  const [selectedRuleSetId, setSelectedRuleSetId] = useState<number | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isLoadingSets, setIsLoadingSets] = useState(false)
  const [isComparing, setIsComparing] = useState(false)
  const [catalogLookup, setCatalogLookup] = useState<Partial<Record<RubricaRuleFieldKey, Map<string, string>>>>({})
  const [selectedComparisonFieldKeys, setSelectedComparisonFieldKeys] = useState<Set<RubricaRuleFieldKey>>(
    () => new Set(DEFAULT_SELECTED_COMPARISON_FIELDS),
  )
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ComparisonResult | null>(null)

  const availableComparisonFields = useMemo(
    () => RUBRICA_RULE_FIELD_DEFINITIONS.filter((field) => !EXCLUDED_FIELDS.has(field.key) && field.key !== 'rv_codfol'),
    [],
  )

  const selectedRuleSet = useMemo(
    () => ruleSets.find((item) => item.id === selectedRuleSetId) ?? null,
    [ruleSets, selectedRuleSetId],
  )

  const fetchRuleSets = async () => {
    setIsLoadingSets(true)
    setError(null)

    try {
      const response = await fetch(apiUrl('/api/rubricas/regras/sets'))
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Falha ao carregar os cadastros de tabela de regra.')
      }

      const body = await response.json() as { items?: unknown[] }
      const sets = Array.isArray(body.items) ? body.items.map(mapRuleSetRow) : []
      setRuleSets(sets)
      setSelectedRuleSetId((prev) => {
        if (prev && sets.some((item) => item.id === prev)) return prev
        return sets[0]?.id ?? null
      })
    } catch (err) {
      setRuleSets([])
      setSelectedRuleSetId(null)
      setError(toFriendlyApiError(err, 'Nao foi possivel carregar os cadastros.'))
    } finally {
      setIsLoadingSets(false)
    }
  }

  const fetchCatalogLookup = async () => {
    const entries = Object.entries(FIELD_CATALOG_MAP) as Array<[RubricaRuleFieldKey, string]>

    try {
      const results = await Promise.all(entries.map(async ([fieldKey, catalogKey]) => {
        const response = await fetch(apiUrl(`/api/rubricas/catalogs/${catalogKey}/items`))
        if (!response.ok) {
          const text = await response.text()
          throw new Error(text || `Falha ao carregar o cadastro auxiliar ${catalogKey}.`)
        }

        const body = await response.json() as { items?: unknown[] }
        const items = Array.isArray(body.items) ? body.items.map(mapCatalogItemRow) : []
        return [
          fieldKey,
          new Map(items.map((item) => [normalizeCode(item.code), item.fullDescription.trim()])),
        ] as const
      }))

      setCatalogLookup(Object.fromEntries(results) as Partial<Record<RubricaRuleFieldKey, Map<string, string>>>)
    } catch (err) {
      setError(toFriendlyApiError(err, 'Nao foi possivel carregar os cadastros auxiliares da comparacao.'))
    }
  }

  useEffect(() => {
    void fetchRuleSets()
    void fetchCatalogLookup()
  }, [])

  const formatFieldValue = (fieldKey: RubricaRuleFieldKey, rawValue: string) => {
    const value = String(rawValue || '').trim()
    if (!value) return '-'

    const lookup = catalogLookup[fieldKey]
    if (!lookup) return value

    const description = lookup.get(normalizeCode(value))
    return description ? `${value} - ${description}` : value
  }

  const handleExportResult = async () => {
    if (!result) return

    try {
      const ExcelJSRuntime = await loadExcelJSRuntime()
      const WorkbookCtor = ExcelJSRuntime.Workbook

      if (!WorkbookCtor) {
        throw new Error('Falha ao carregar biblioteca de exportacao (ExcelJS).')
      }

      const workbook = new WorkbookCtor() as any
      const dateTag = new Date().toISOString().slice(0, 10)
      const allFields = [...RUBRICA_RULE_FIELD_DEFINITIONS]
      const exportReferenceComparableFields = RUBRICA_RULE_FIELD_DEFINITIONS.filter(
        (field) => result.selectedComparisonFieldKeys.includes(field.key)
          && !EXCLUDED_FIELDS.has(field.key)
          && field.key !== 'rv_codfol'
          && !SPECIAL_REFERENCE_FIELDS.has(field.key),
      )

      const summaryWorksheet = workbook.addWorksheet('resumo')
      summaryWorksheet.columns = [
        { header: 'Metrica', key: 'metrica', width: 48 },
        { header: 'Valor', key: 'valor', width: 36 },
      ]
      summaryWorksheet.views = [{ state: 'frozen', ySplit: 1 }]
      summaryWorksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: 2 },
      }

      const summaryRows = [
        { metrica: 'Cadastro base', valor: result.selectedRuleSetName },
        { metrica: 'Registros da Tabela de Regra', valor: result.totalRuleRows },
        { metrica: 'Registros da planilha importada', valor: result.totalImportedRows },
        { metrica: 'Registros equivalentes', valor: result.equalRows },
        { metrica: 'Registros com divergencia', valor: result.divergences.length },
        { metrica: 'RV_CODFOL sem correspondencia na planilha', valor: result.missingInImported.length },
        { metrica: 'RV_CODFOL novo na planilha', valor: result.extraInImported.length },
        { metrica: 'RV_CODFOL duplicado na planilha', valor: result.duplicateCodesInImported.length },
      ]
      summaryRows.forEach((row) => summaryWorksheet.addRow(row))

      const detailedWorksheet = workbook.addWorksheet('divergencias-completas')
      detailedWorksheet.columns = [
        { header: 'Origem', key: 'origem', width: 14 },
        ...allFields.map((field) => ({
          header: field.label,
          key: field.key,
          width: field.key === 'rv_descdet' ? 42 : 28,
        })),
      ]
      detailedWorksheet.views = [{ state: 'frozen', ySplit: 1 }]
      detailedWorksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: allFields.length + 1 },
      }

      const headerRow = detailedWorksheet.getRow(1)
      headerRow.font = { bold: true }

      const highlightFill = {
        type: 'pattern' as const,
        pattern: 'solid' as const,
        fgColor: { argb: 'FFFFC7CE' },
        bgColor: { argb: 'FFFFC7CE' },
      }

      const baseRowFill = {
        type: 'pattern' as const,
        pattern: 'solid' as const,
        fgColor: { argb: 'FFE2F0D9' },
        bgColor: { argb: 'FFE2F0D9' },
      }

      const importedRowFill = {
        type: 'pattern' as const,
        pattern: 'solid' as const,
        fgColor: { argb: 'FFDDEBF7' },
        bgColor: { argb: 'FFDDEBF7' },
      }

      const referenceRowFill = {
        type: 'pattern' as const,
        pattern: 'solid' as const,
        fgColor: { argb: 'FFFCE4D6' },
        bgColor: { argb: 'FFFCE4D6' },
      }

      if (!result.divergences.length) {
        detailedWorksheet.addRow({ origem: 'Sem dados' })
        detailedWorksheet.mergeCells(2, 1, 2, allFields.length + 1)
        const noDataCell = detailedWorksheet.getCell(2, 1)
        noDataCell.value = 'Nenhuma divergencia encontrada para exportar.'
        noDataCell.alignment = { vertical: 'middle', horizontal: 'center' }
      } else {
        for (const divergence of result.divergences) {
          const divergentFields = new Set(divergence.diffs.map((diff) => diff.field.key))

          const baseRow = detailedWorksheet.addRow({
            origem: 'Base',
            ...Object.fromEntries(
              allFields.map((field) => [field.key, formatFieldValue(field.key, divergence.ruleRow[field.key])]),
            ),
          })

          const importedRow = detailedWorksheet.addRow({
            origem: 'Importado',
            ...Object.fromEntries(
              allFields.map((field) => {
                if (field.key === 'rv_desc') {
                  const importedCode = String(divergence.importedRow.__rv_cod || '').trim()
                  const importedDescription = String(divergence.importedRow.rv_desc || '').trim()

                  const combinedDescription = importedCode && importedDescription
                    ? `${importedCode} - ${importedDescription}`
                    : importedDescription || importedCode

                  return [field.key, combinedDescription || '-']
                }

                return [field.key, formatFieldValue(field.key, divergence.importedRow[field.key])]
              }),
            ),
          })

          baseRow.eachCell({ includeEmpty: true }, (cell: any) => {
            cell.fill = baseRowFill
          })

          importedRow.eachCell({ includeEmpty: true }, (cell: any) => {
            cell.fill = importedRowFill
          })

          for (const fieldKey of divergentFields) {
            const fieldIndex = allFields.findIndex((field) => field.key === fieldKey)
            if (fieldIndex < 0) continue

            const column = fieldIndex + 2
            const baseCell = baseRow.getCell(column)
            const importedCell = importedRow.getCell(column)

            baseCell.fill = highlightFill
            importedCell.fill = highlightFill
            baseCell.font = { color: { argb: 'FF9C0006' } }
            importedCell.font = { color: { argb: 'FF9C0006' } }
          }

          const sortedSpecialReferences = [...divergence.specialReferences].sort((a, b) => {
            const indexA = SPECIAL_REFERENCE_EXPORT_ORDER.indexOf(a.field.key)
            const indexB = SPECIAL_REFERENCE_EXPORT_ORDER.indexOf(b.field.key)

            const normalizedIndexA = indexA >= 0 ? indexA : Number.MAX_SAFE_INTEGER
            const normalizedIndexB = indexB >= 0 ? indexB : Number.MAX_SAFE_INTEGER

            if (normalizedIndexA !== normalizedIndexB) {
              return normalizedIndexA - normalizedIndexB
            }

            return a.referenceCode.localeCompare(b.referenceCode)
          })

          for (const reference of sortedSpecialReferences) {
            const importedSpecialCode = String(reference.importedVerbaCode || '').trim()
            const linkedImportedRow = reference.linkedImportedRow
            const baseReferenceRow = reference.referenceRow || reference.importedReferenceRow || linkedImportedRow
            const importedReferenceRow = reference.importedReferenceRow || linkedImportedRow || reference.referenceRow
            const referenceDivergentFields = new Set<RubricaRuleFieldKey>()

            if (baseReferenceRow && importedReferenceRow) {
              for (const field of exportReferenceComparableFields) {
                const expected = String(baseReferenceRow[field.key] ?? '').trim()
                const found = String(importedReferenceRow[field.key] ?? '').trim()
                const { expectedComparable, foundComparable } = normalizeComparablePair(field.key, expected, found)

                if (expectedComparable !== foundComparable) {
                  referenceDivergentFields.add(field.key)
                }
              }
            }

            const baseSpecialRow = detailedWorksheet.addRow({
              origem: 'Base',
              ...Object.fromEntries(
                allFields.map((field) => {
                  if (field.key === 'rv_desc') {
                    const referenceDescription = buildReferenceDescription(baseReferenceRow, reference.referenceCode)
                    const descriptionWithImportedCode = importedSpecialCode && referenceDescription
                      ? `${importedSpecialCode} - ${referenceDescription}`
                      : referenceDescription || importedSpecialCode || '-'
                    return [field.key, descriptionWithImportedCode]
                  }

                  if (field.key === 'rv_codfol') {
                    return [field.key, formatReferenceCode(reference.referenceCode)]
                  }

                  return [field.key, formatFieldValue(field.key, baseReferenceRow?.[field.key] || '')]
                }),
              ),
            })

            const importedSpecialRow = detailedWorksheet.addRow({
              origem: 'Importado',
              ...Object.fromEntries(
                allFields.map((field) => {
                  if (field.key === 'rv_desc') {
                    const importedDescription = String(importedReferenceRow?.rv_desc || '').trim()
                    const descriptionWithImportedCode = importedSpecialCode && importedDescription
                      ? `${importedSpecialCode} - ${importedDescription}`
                      : importedDescription || importedSpecialCode || '-'
                    return [field.key, descriptionWithImportedCode]
                  }

                  if (field.key === 'rv_codfol') {
                    return [field.key, formatReferenceCode(reference.referenceCode)]
                  }

                  return [field.key, formatFieldValue(field.key, importedReferenceRow?.[field.key] || '')]
                }),
              ),
            })

            baseSpecialRow.eachCell({ includeEmpty: true }, (cell: any) => {
              cell.fill = referenceRowFill
            })

            importedSpecialRow.eachCell({ includeEmpty: true }, (cell: any) => {
              cell.fill = importedRowFill
            })

            const referenceRowsToHighlight = [baseSpecialRow, importedSpecialRow]
            for (const fieldKey of referenceDivergentFields) {
              const fieldIndex = allFields.findIndex((field) => field.key === fieldKey)
              if (fieldIndex < 0) continue

              const column = fieldIndex + 2
              for (const worksheetRow of referenceRowsToHighlight) {
                const referenceCell = worksheetRow.getCell(column)
                referenceCell.fill = highlightFill
                referenceCell.font = { color: { argb: 'FF9C0006' } }
              }
            }
          }
        }
      }

      const missingRows = result.missingInImported.map((code) => ({ rv_codfol: formatFieldValue('rv_codfol', code) }))
      const extraRows = result.extraInImported.map((code) => ({ rv_codfol: formatFieldValue('rv_codfol', code) }))
      const duplicateRows = result.duplicateCodesInImported.map((code) => ({ rv_codfol: formatFieldValue('rv_codfol', code) }))

      const missingWorksheet = workbook.addWorksheet('sem-correspondencia')
      missingWorksheet.columns = [{ header: 'RV_CODFOL', key: 'rv_codfol', width: 56 }]
      missingWorksheet.views = [{ state: 'frozen', ySplit: 1 }]
      missingWorksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: 1 },
      }
      ;(missingRows.length ? missingRows : [{ rv_codfol: 'Nenhum RV_CODFOL sem correspondencia.' }]).forEach((row) => missingWorksheet.addRow(row))

      const extraWorksheet = workbook.addWorksheet('novos-na-planilha')
      extraWorksheet.columns = [{ header: 'RV_CODFOL', key: 'rv_codfol', width: 56 }]
      extraWorksheet.views = [{ state: 'frozen', ySplit: 1 }]
      extraWorksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: 1 },
      }
      ;(extraRows.length ? extraRows : [{ rv_codfol: 'Nenhum RV_CODFOL novo na planilha.' }]).forEach((row) => extraWorksheet.addRow(row))

      const duplicateWorksheet = workbook.addWorksheet('duplicados')
      duplicateWorksheet.columns = [{ header: 'RV_CODFOL', key: 'rv_codfol', width: 56 }]
      duplicateWorksheet.views = [{ state: 'frozen', ySplit: 1 }]
      duplicateWorksheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: 1 },
      }
      ;(duplicateRows.length ? duplicateRows : [{ rv_codfol: 'Nenhum RV_CODFOL duplicado.' }]).forEach((row) => duplicateWorksheet.addRow(row))

      const outputBuffer = await workbook.xlsx.writeBuffer()
      const outputBlob = new Blob([outputBuffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })

      const downloadUrl = URL.createObjectURL(outputBlob)
      const anchor = document.createElement('a')
      anchor.href = downloadUrl
      anchor.download = `${sanitizeFileNameSegment(result.selectedRuleSetName)}-${dateTag}.xlsx`
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(downloadUrl)
    } catch (err) {
      setError(toFriendlyApiError(err, 'Nao foi possivel exportar o resultado da comparacao.'))
    }
  }

  const handleCompare = async () => {
    if (!selectedRuleSetId) {
      setError('Selecione um cadastro de Tabela de Regra para comparar.')
      return
    }

    if (!selectedFile) {
      setError('Selecione uma planilha para comparacao.')
      return
    }

    if (!selectedComparisonFieldKeys.size) {
      setError('Selecione ao menos um campo para validar na comparacao.')
      return
    }

    setError(null)
    setResult(null)
    setIsComparing(true)

    try {
      const [rowsFromSheet, ruleItemsResponse] = await Promise.all([
        parseWorkbookRows(selectedFile),
        fetch(apiUrl(`/api/rubricas/regras/sets/${selectedRuleSetId}/items`)),
      ])

      if (!ruleItemsResponse.ok) {
        const text = await ruleItemsResponse.text()
        throw new Error(text || 'Falha ao carregar as regras do cadastro selecionado.')
      }

      const itemsBody = await ruleItemsResponse.json() as { items?: unknown[] }
      const ruleRows = Array.isArray(itemsBody.items) ? itemsBody.items.map(mapRuleItemRow) : []

      const compared = compareRuleRows(
        ruleRows,
        rowsFromSheet,
        selectedRuleSet?.name || `Cadastro ${selectedRuleSetId}`,
        selectedComparisonFieldKeys,
      )
      setResult(compared)
    } catch (err) {
      setError(toFriendlyApiError(err, 'Nao foi possivel comparar os dados da planilha com a tabela de regra.'))
    } finally {
      setIsComparing(false)
    }
  }

  return (
    <div className="customer-hub">
      <section className="card">
        <div className="ch-section-header">
          <div>
            <h2>Comparar Planilha x Tabela de Regra</h2>
            <p className="muted">
              No cabeçalho deverá conter o nome do campo (Ex: RV_CODFOL) e não a descrição.
            </p>
          </div>
        </div>

        <div className="ch-table-toolbar rubrica-compare-toolbar">
          <label style={{ minWidth: '280px', display: 'grid', gap: '0.35rem' }}>
            <span className="muted" style={{ fontSize: '0.82rem' }}>Cadastro de Regra</span>
            <select
              value={selectedRuleSetId ?? ''}
              disabled={isLoadingSets || !ruleSets.length}
              onChange={(event) => setSelectedRuleSetId(event.target.value ? Number(event.target.value) : null)}
            >
              {!ruleSets.length && <option value="">Nenhum cadastro disponível</option>}
              {ruleSets.map((ruleSet) => (
                <option key={ruleSet.id} value={ruleSet.id}>{ruleSet.name}</option>
              ))}
            </select>
          </label>

          <label className="file-input" style={{ margin: 0 }}>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            />
            <span>{selectedFile ? selectedFile.name : 'Selecionar Comparação'}</span>
          </label>

          <button type="button" className="button-primary" onClick={handleCompare} disabled={isComparing || isLoadingSets}>
            {isComparing ? 'Comparando...' : 'Comparar'}
          </button>
        </div>

        <div className="rubrica-compare-fields">
          <div className="rubrica-compare-fields__header">
            <strong>Campos a validar na comparação</strong>
            <span className="muted">Padrao inicial aplicado conforme configuracao solicitada.</span>
          </div>

          <div className="rubrica-compare-fields__actions">
            <button
              type="button"
              className="button-secondary"
              onClick={() => setSelectedComparisonFieldKeys(new Set(availableComparisonFields.map((field) => field.key)))}
            >
              Marcar todos
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setSelectedComparisonFieldKeys(new Set(DEFAULT_SELECTED_COMPARISON_FIELDS))}
            >
              Restaurar padrao
            </button>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setSelectedComparisonFieldKeys(new Set())}
            >
              Desmarcar todos
            </button>
          </div>

          <div className="rubrica-compare-fields__grid">
            {availableComparisonFields.map((field) => {
              const isSelected = selectedComparisonFieldKeys.has(field.key)

              return (
                <label key={field.key} className="rubrica-compare-fields__item">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(event) => {
                      setSelectedComparisonFieldKeys((prev) => {
                        const next = new Set(prev)
                        if (event.target.checked) {
                          next.add(field.key)
                        } else {
                          next.delete(field.key)
                        }
                        return next
                      })
                    }}
                  />
                  <span className="rubrica-compare-fields__field">{field.label}</span>
                  <span className={isSelected ? 'rubrica-compare-fields__status rubrica-compare-fields__status--on' : 'rubrica-compare-fields__status'}>
                    {isSelected ? 'Validar' : 'Nao validar'}
                  </span>
                </label>
              )
            })}
          </div>
        </div>

        {error && <p className="error">{error}</p>}
      </section>

      {result && (
        <section className="card">
          <div className="ch-section-header">
            <div>
              <h3>Resultado da Comparação</h3>
              <p className="muted">Cadastro base: {result.selectedRuleSetName}</p>
            </div>
            <button type="button" className="button-primary" onClick={handleExportResult}>
              Exportar resultado
            </button>
          </div>

          <div className="results">
            <ul>
              <li><strong>Registros da Tabela de Regra:</strong> {result.totalRuleRows}</li>
              <li><strong>Registros da planilha importada:</strong> {result.totalImportedRows}</li>
              <li><strong>Registros equivalentes:</strong> {result.equalRows}</li>
              <li><strong>Registros com divergência:</strong> {result.divergences.length}</li>
              <li><strong>RV_CODFOL sem correspondência na planilha:</strong> {result.missingInImported.length}</li>
              <li><strong>RV_CODFOL novo na planilha:</strong> {result.extraInImported.length}</li>
              <li><strong>RV_CODFOL duplicado na planilha:</strong> {result.duplicateCodesInImported.length}</li>
            </ul>
          </div>

        </section>
      )}
    </div>
  )
}
