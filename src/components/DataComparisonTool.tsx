import { useMemo, useState, type ChangeEvent } from 'react'
import * as XLSX from 'xlsx'

type ParsedRow = {
  rowNumber: number
  values: Record<string, string>
}

type ParsedDataset = {
  fileName: string
  headers: string[]
  rows: ParsedRow[]
}

type MappingType = 'key' | 'value'

type MappingRule = {
  id: number
  type: MappingType
  baseField: string
  targetField: string
}

type IssueType = 'missing_in_target' | 'extra_in_target' | 'value_mismatch' | 'duplicate_key'

type ComparisonIssue = {
  type: IssueType
  key: string
  field: string
  baseValue: string
  targetValue: string
  detail: string
}

type ComparisonSummary = {
  missingInTarget: number
  extraInTarget: number
  mismatches: number
  duplicateKeysInBase: number
  duplicateKeysInTarget: number
}

type ComparisonResult = {
  baseFileName: string
  targetFileName: string
  keyMappings: MappingRule[]
  valueMappings: MappingRule[]
  summary: ComparisonSummary
  issues: ComparisonIssue[]
}

const DELIMITER_CANDIDATES = [';', ',', '\t', '|']
const RESULT_PAGE_SIZE = 100
const KEY_HINTS = ['id', 'codigo', 'cod', 'codi', 'chave', 'documento', 'doc', 'numero', 'num', 'matricula', 'cnpj', 'cpf', 'cbase']
const VALUE_HINTS = ['valor', 'vl', 'depre', 'saldo', 'total', 'preco', 'price', 'amount', 'custo', 'taxa']

let pdfjsModulePromise: Promise<typeof import('pdfjs-dist')> | null = null

async function loadPdfjs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url,
      ).href
      return lib
    })
  }

  return pdfjsModulePromise
}

function normalizeHeader(value: string): string {
  return String(value)
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .toLowerCase()
}

function normalizeCell(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function normalizeForCompare(value: string): string {
  const normalized = normalizeCell(value).toLowerCase()

  if (/^-?\d+$/.test(normalized)) {
    const sign = normalized.startsWith('-') ? '-' : ''
    const digits = normalized.replace(/^-/, '').replace(/^0+(?=\d)/, '')
    return `${sign}${digits || '0'}`
  }

  return normalized
}

function parseNumericValue(value: string): number | null {
  const trimmed = String(value ?? '').trim().replace(/^r\$\s*/i, '').replace(/%$/, '')
  if (!trimmed) return null

  const brFormat = /^-?[\d.]+,\d+$/.test(trimmed)
  if (brFormat) {
    const normalized = trimmed.replace(/\./g, '').replace(',', '.')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  const usFormat = /^-?[\d,]+\.\d+$/.test(trimmed)
  if (usFormat) {
    const normalized = trimmed.replace(/,/g, '')
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }

  const plain = trimmed.replace(',', '.')
  const parsed = Number(plain)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDecimalValue(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function normalizeValueForComparison(value: string): string {
  const parsed = parseNumericValue(value)
  if (parsed === null) return normalizeForCompare(value)
  return formatDecimalValue(parsed)
}

function isWithinTolerance(baseValue: number, targetValue: number, tolerance: number): boolean {
  const difference = Math.abs(baseValue - targetValue)
  return difference <= tolerance + 1e-9
}

function normalizeValueForDisplay(value: string): string {
  const parsed = parseNumericValue(value)
  if (parsed === null) return normalizeCell(value)
  return formatDecimalValue(parsed)
}

function normalizeFieldForSimilarity(value: string): string {
  return normalizeHeader(value)
    .replace(/^[a-z]\d+_/, '')
    .replace(/^n\d+_/, '')
    .replace(/[^a-z0-9_]/g, '')
}

function tokenizeField(value: string): string[] {
  const normalized = normalizeFieldForSimilarity(value)
  const rawTokens = normalized.split('_').map((token) => token.trim()).filter(Boolean)

  return rawTokens.map((token) => {
    if (['codigo', 'cod', 'codi', 'id', 'chave', 'doc', 'documento', 'numero', 'num'].includes(token)) return 'id'
    if (['valor', 'vl', 'amount', 'price', 'saldo', 'total', 'depre', 'depreciacao', 'custo', 'taxa'].includes(token)) return 'valor'
    return token
  })
}

function containsHint(field: string, hints: string[]): boolean {
  const normalized = normalizeFieldForSimilarity(field)
  return hints.some((hint) => normalized.includes(hint))
}

function levenshteinDistance(left: string, right: string): number {
  const a = left.toLowerCase()
  const b = right.toLowerCase()
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i += 1) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j += 1) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i += 1) {
    for (let j = 1; j <= a.length; j += 1) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1,
        )
      }
    }
  }

  return matrix[b.length][a.length]
}

function stringSimilarity(left: string, right: string): number {
  const a = normalizeFieldForSimilarity(left)
  const b = normalizeFieldForSimilarity(right)
  const maxLength = Math.max(a.length, b.length)
  if (!maxLength) return 1

  const distance = levenshteinDistance(a, b)
  return 1 - distance / maxLength
}

function tokenSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenizeField(left))
  const rightTokens = new Set(tokenizeField(right))

  if (!leftTokens.size || !rightTokens.size) return 0

  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length
  const union = new Set([...leftTokens, ...rightTokens]).size
  return union ? intersection / union : 0
}

function fieldSimilarity(left: string, right: string): number {
  const lexical = stringSimilarity(left, right)
  const token = tokenSimilarity(left, right)
  return (lexical * 0.6) + (token * 0.4)
}

function suggestMappings(
  baseHeaders: string[],
  targetHeaders: string[],
): { keys: Array<{ baseField: string; targetField: string }>; values: Array<{ baseField: string; targetField: string }> } {
  const usedTargets = new Set<string>()

  const rankCandidates = (baseField: string, candidates: string[]) => {
    return candidates
      .map((targetField) => ({
        targetField,
        score: fieldSimilarity(baseField, targetField),
      }))
      .sort((a, b) => b.score - a.score)
  }

  const pickMappings = (baseCandidates: string[], minScore: number, maxCount: number) => {
    const picked: Array<{ baseField: string; targetField: string }> = []

    for (const baseField of baseCandidates) {
      const ranked = rankCandidates(baseField, targetHeaders.filter((target) => !usedTargets.has(target)))
      const best = ranked[0]
      if (!best || best.score < minScore) continue

      usedTargets.add(best.targetField)
      picked.push({ baseField, targetField: best.targetField })
      if (picked.length >= maxCount) break
    }

    return picked
  }

  const keyBaseCandidates = baseHeaders.filter((field) => containsHint(field, KEY_HINTS))
  const valueBaseCandidates = baseHeaders.filter((field) => containsHint(field, VALUE_HINTS))

  const keyMappings = pickMappings(
    keyBaseCandidates.length ? keyBaseCandidates : baseHeaders,
    0.2,
    3,
  )

  const valueMappings = pickMappings(
    valueBaseCandidates.length ? valueBaseCandidates : baseHeaders,
    0.2,
    6,
  )

  return {
    keys: keyMappings,
    values: valueMappings,
  }
}

function detectDelimiter(line: string): string | null {
  let best: string | null = null
  let bestCount = 0

  for (const delimiter of DELIMITER_CANDIDATES) {
    const count = line.split(delimiter).length - 1
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }

  return bestCount > 0 ? best : null
}

function splitLine(line: string, delimiter: string): string[] {
  const output: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === delimiter && !inQuotes) {
      output.push(current)
      current = ''
      continue
    }

    current += char
  }

  output.push(current)
  return output.map((value) => normalizeCell(value))
}

function matrixToDataset(fileName: string, matrix: string[][]): ParsedDataset {
  const cleanedRows = matrix
    .map((row) => row.map((cell) => normalizeCell(cell)))
    .filter((row) => row.some((cell) => cell.length > 0))

  if (!cleanedRows.length) {
    return { fileName, headers: [], rows: [] }
  }

  const rawHeaders = cleanedRows[0]
  const normalizedHeaders = rawHeaders.map((header, index) => normalizeHeader(header || `coluna_${index + 1}`))

  const headers = normalizedHeaders.map((header, index) => {
    const duplicates = normalizedHeaders.slice(0, index).filter((h) => h === header).length
    return duplicates ? `${header}_${duplicates + 1}` : header
  })

  const rows: ParsedRow[] = cleanedRows.slice(1).map((row, index) => {
    const values: Record<string, string> = {}

    headers.forEach((header, colIndex) => {
      values[header] = normalizeCell(row[colIndex])
    })

    return {
      rowNumber: index + 2,
      values,
    }
  })

  return {
    fileName,
    headers,
    rows,
  }
}

function parseTextDataset(fileName: string, text: string): ParsedDataset {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (!lines.length) return { fileName, headers: [], rows: [] }

  const delimiter = detectDelimiter(lines[0])

  if (!delimiter) {
    return matrixToDataset(fileName, [['conteudo'], ...lines.map((line) => [line])])
  }

  const matrix = lines.map((line) => splitLine(line, delimiter))
  return matrixToDataset(fileName, matrix)
}

async function parsePdfDataset(file: File): Promise<ParsedDataset> {
  const pdfjs = await loadPdfjs()
  const data = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise
  const lines: string[] = []

  for (let page = 1; page <= pdf.numPages; page += 1) {
    const pageRef = await pdf.getPage(page)
    const content = await pageRef.getTextContent()
    const line = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .map((item) => item.trim())
      .filter(Boolean)
      .join(' ')

    if (line) lines.push(line)
  }

  return parseTextDataset(file.name, lines.join('\n'))
}

async function parseFileDataset(file: File): Promise<ParsedDataset> {
  const lowerName = file.name.toLowerCase()

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!firstSheet) return { fileName: file.name, headers: [], rows: [] }

    const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(firstSheet, {
      header: 1,
      raw: false,
      defval: '',
    })

    return matrixToDataset(file.name, matrix.map((row) => row.map((cell) => String(cell ?? ''))))
  }

  if (lowerName.endsWith('.pdf')) {
    return parsePdfDataset(file)
  }

  const text = await file.text()
  return parseTextDataset(file.name, text)
}

function issueTypeLabel(type: IssueType): string {
  if (type === 'missing_in_target') return 'Ausente no comparado'
  if (type === 'extra_in_target') return 'Extra no comparado'
  if (type === 'value_mismatch') return 'Valor divergente'
  return 'Chave duplicada'
}

function buildMappedKey(row: ParsedRow, mappings: MappingRule[], side: 'base' | 'target'): string | null {
  const values = mappings.map((mapping) => {
    const fieldName = side === 'base' ? mapping.baseField : mapping.targetField
    return normalizeForCompare(row.values[fieldName] ?? '')
  })

  if (values.some((value) => !value)) return null
  return values.join(' | ')
}

function buildMappedIndex(rows: ParsedRow[], mappings: MappingRule[], side: 'base' | 'target') {
  const byKey = new Map<string, ParsedRow>()
  const duplicateKeys = new Set<string>()

  rows.forEach((row) => {
    const key = buildMappedKey(row, mappings, side)
    if (!key) return

    if (byKey.has(key)) {
      duplicateKeys.add(key)
      return
    }

    byKey.set(key, row)
  })

  return {
    byKey,
    duplicateKeys: [...duplicateKeys],
  }
}

function compareDatasets(
  base: ParsedDataset,
  target: ParsedDataset,
  keyMappings: MappingRule[],
  valueMappings: MappingRule[],
  valueTolerance: number,
): ComparisonResult {
  const issues: ComparisonIssue[] = []

  const baseIndex = buildMappedIndex(base.rows, keyMappings, 'base')
  const targetIndex = buildMappedIndex(target.rows, keyMappings, 'target')

  baseIndex.duplicateKeys.forEach((key) => {
    issues.push({
      type: 'duplicate_key',
      key,
      field: keyMappings.map((mapping) => `${mapping.baseField} -> ${mapping.targetField}`).join(' | '),
      baseValue: key,
      targetValue: key,
      detail: 'Chave duplicada no arquivo A.',
    })
  })

  targetIndex.duplicateKeys.forEach((key) => {
    issues.push({
      type: 'duplicate_key',
      key,
      field: keyMappings.map((mapping) => `${mapping.baseField} -> ${mapping.targetField}`).join(' | '),
      baseValue: key,
      targetValue: key,
      detail: 'Chave duplicada no arquivo B.',
    })
  })

  baseIndex.byKey.forEach((baseRow, key) => {
    const targetRow = targetIndex.byKey.get(key)

    if (!targetRow) {
      issues.push({
        type: 'missing_in_target',
        key,
        field: keyMappings.map((mapping) => `${mapping.baseField} -> ${mapping.targetField}`).join(' | '),
        baseValue: key,
        targetValue: '',
        detail: 'Registro existe no arquivo A e nao foi encontrado no arquivo B.',
      })
      return
    }

    valueMappings.forEach((mapping) => {
      const baseValue = normalizeCell(baseRow.values[mapping.baseField] ?? '')
      const targetValue = normalizeCell(targetRow.values[mapping.targetField] ?? '')

      const baseNumeric = parseNumericValue(baseValue)
      const targetNumeric = parseNumericValue(targetValue)

      if (baseNumeric !== null && targetNumeric !== null) {
        if (isWithinTolerance(baseNumeric, targetNumeric, valueTolerance)) return

        issues.push({
          type: 'value_mismatch',
          key,
          field: `${mapping.baseField} -> ${mapping.targetField}`,
          baseValue: formatDecimalValue(baseNumeric),
          targetValue: formatDecimalValue(targetNumeric),
          detail: `Valor divergente acima da tolerância de ${formatDecimalValue(valueTolerance)}.`,
        })
        return
      }

      const normalizedBaseValue = normalizeValueForComparison(baseValue)
      const normalizedTargetValue = normalizeValueForComparison(targetValue)

      if (normalizedBaseValue === normalizedTargetValue) return

      issues.push({
        type: 'value_mismatch',
        key,
        field: `${mapping.baseField} -> ${mapping.targetField}`,
        baseValue: normalizeValueForDisplay(baseValue),
        targetValue: normalizeValueForDisplay(targetValue),
        detail: 'Valor divergente entre os campos mapeados.',
      })
    })
  })

  targetIndex.byKey.forEach((_targetRow, key) => {
    if (baseIndex.byKey.has(key)) return

    issues.push({
      type: 'extra_in_target',
      key,
      field: keyMappings.map((mapping) => `${mapping.baseField} -> ${mapping.targetField}`).join(' | '),
      baseValue: '',
      targetValue: key,
      detail: 'Registro existe no arquivo B e nao existe no arquivo A.',
    })
  })

  const summary: ComparisonSummary = {
    missingInTarget: issues.filter((item) => item.type === 'missing_in_target').length,
    extraInTarget: issues.filter((item) => item.type === 'extra_in_target').length,
    mismatches: issues.filter((item) => item.type === 'value_mismatch').length,
    duplicateKeysInBase: baseIndex.duplicateKeys.length,
    duplicateKeysInTarget: targetIndex.duplicateKeys.length,
  }

  return {
    baseFileName: base.fileName,
    targetFileName: target.fileName,
    keyMappings,
    valueMappings,
    summary,
    issues,
  }
}

function exportComparisonToExcel(result: ComparisonResult, issues: ComparisonIssue[]) {
  const workbook = XLSX.utils.book_new()

  const summaryRows = [
    {
      arquivo_a: result.baseFileName,
      arquivo_b: result.targetFileName,
      total_divergencias: issues.length,
      ausentes_no_b: result.summary.missingInTarget,
      extras_no_b: result.summary.extraInTarget,
      valores_divergentes: result.summary.mismatches,
      chaves_duplicadas_a: result.summary.duplicateKeysInBase,
      chaves_duplicadas_b: result.summary.duplicateKeysInTarget,
    },
  ]

  const mappingRows = [
    ...result.keyMappings.map((mapping) => ({
      tipo: 'chave',
      campo_arquivo_a: mapping.baseField,
      campo_arquivo_b: mapping.targetField,
    })),
    ...result.valueMappings.map((mapping) => ({
      tipo: 'valor',
      campo_arquivo_a: mapping.baseField,
      campo_arquivo_b: mapping.targetField,
    })),
  ]

  const issueRows = issues.length
    ? issues.map((issue) => ({
      tipo: issueTypeLabel(issue.type),
      chave: issue.key,
      campo: issue.field,
      valor_arquivo_a: issue.baseValue,
      valor_arquivo_b: issue.targetValue,
      detalhe: issue.detail,
    }))
    : [{
      tipo: 'Sem divergências',
      chave: '',
      campo: '',
      valor_arquivo_a: '',
      valor_arquivo_b: '',
      detalhe: 'Nenhuma divergência encontrada para os filtros selecionados.',
    }]

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), 'Resumo')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(mappingRows), 'Mapeamentos')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(issueRows), 'Divergencias')

  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')
  XLSX.writeFile(workbook, `comparacao-arquivos-${stamp}.xlsx`)
}

function toFriendlyError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return 'Falha ao ler arquivo. Verifique se o formato e valido e tente novamente.'
  }

  if (error instanceof Error) {
    return error.message || fallback
  }

  return fallback
}

export default function DataComparisonTool() {
  const [baseDataset, setBaseDataset] = useState<ParsedDataset | null>(null)
  const [targetDataset, setTargetDataset] = useState<ParsedDataset | null>(null)
  const [isParsingBase, setIsParsingBase] = useState(false)
  const [isParsingTarget, setIsParsingTarget] = useState(false)
  const [isComparing, setIsComparing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | IssueType>('all')
  const [keyFilter, setKeyFilter] = useState('')
  const [suggestionMode, setSuggestionMode] = useState<'keys' | 'keys-and-values'>('keys-and-values')
  const [resultPage, setResultPage] = useState(1)
  const [valueTolerance, setValueTolerance] = useState(0.01)

  const [mappings, setMappings] = useState<MappingRule[]>([
    { id: 1, type: 'key', baseField: '', targetField: '' },
    { id: 2, type: 'value', baseField: '', targetField: '' },
  ])

  const keyMappings = useMemo(
    () => mappings.filter((mapping) => mapping.type === 'key' && mapping.baseField && mapping.targetField),
    [mappings],
  )

  const valueMappings = useMemo(
    () => mappings.filter((mapping) => mapping.type === 'value' && mapping.baseField && mapping.targetField),
    [mappings],
  )

  const filteredIssues = useMemo(() => {
    if (!result) return []

    const term = keyFilter.trim().toLowerCase()

    return result.issues.filter((issue) => {
      if (typeFilter !== 'all' && issue.type !== typeFilter) return false
      if (term && !issue.key.toLowerCase().includes(term)) return false
      return true
    })
  }, [keyFilter, result, typeFilter])

  const totalResultPages = useMemo(() => {
    if (!filteredIssues.length) return 0
    return Math.ceil(filteredIssues.length / RESULT_PAGE_SIZE)
  }, [filteredIssues])

  const currentResultPage = useMemo(() => {
    if (!totalResultPages) return 0
    return Math.min(resultPage, totalResultPages)
  }, [resultPage, totalResultPages])

  const previewIssues = useMemo(() => {
    if (!currentResultPage) return []
    const startIndex = (currentResultPage - 1) * RESULT_PAGE_SIZE
    return filteredIssues.slice(startIndex, startIndex + RESULT_PAGE_SIZE)
  }, [currentResultPage, filteredIssues])

  const handleDatasetChange = async (file: File | null, side: 'base' | 'target') => {
    if (!file) {
      if (side === 'base') {
        setBaseDataset(null)
      } else {
        setTargetDataset(null)
      }
      return
    }

    setError(null)
    setSuccess(null)
    setResult(null)

    if (side === 'base') {
      setIsParsingBase(true)
    } else {
      setIsParsingTarget(true)
    }

    try {
      const parsed = await parseFileDataset(file)
      if (!parsed.headers.length) {
        throw new Error('Arquivo sem cabecalho valido para comparação.')
      }

      if (side === 'base') {
        setBaseDataset(parsed)
      } else {
        setTargetDataset(parsed)
      }
    } catch (parseError) {
      setError(toFriendlyError(parseError, 'Nao foi possivel processar o arquivo informado.'))
      if (side === 'base') {
        setBaseDataset(null)
      } else {
        setTargetDataset(null)
      }
    } finally {
      if (side === 'base') {
        setIsParsingBase(false)
      } else {
        setIsParsingTarget(false)
      }
    }
  }

  const handleBaseFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleDatasetChange(event.target.files?.[0] ?? null, 'base')
  }

  const handleTargetFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    void handleDatasetChange(event.target.files?.[0] ?? null, 'target')
  }

  const addMapping = (type: MappingType) => {
    const nextId = mappings.length ? Math.max(...mappings.map((item) => item.id)) + 1 : 1
    setMappings((prev) => [...prev, { id: nextId, type, baseField: '', targetField: '' }])
  }

  const removeMapping = (id: number) => {
    setMappings((prev) => {
      if (prev.length <= 1) return prev
      return prev.filter((item) => item.id !== id)
    })
  }

  const updateMapping = (id: number, patch: Partial<MappingRule>) => {
    setMappings((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)))
  }

  const applySuggestedMappings = () => {
    if (!baseDataset || !targetDataset) {
      setError('Selecione os dois arquivos antes de sugerir os mapeamentos.')
      return
    }

    const suggested = suggestMappings(baseDataset.headers, targetDataset.headers)
    const nextMappings: MappingRule[] = []
    let nextId = 1

    suggested.keys.forEach((mapping) => {
      nextMappings.push({
        id: nextId,
        type: 'key',
        baseField: mapping.baseField,
        targetField: mapping.targetField,
      })
      nextId += 1
    })

    if (suggestionMode === 'keys-and-values') {
      suggested.values.forEach((mapping) => {
        nextMappings.push({
          id: nextId,
          type: 'value',
          baseField: mapping.baseField,
          targetField: mapping.targetField,
        })
        nextId += 1
      })
    }

    if (!nextMappings.length) {
      setError('Nao foi possivel sugerir mapeamentos automaticamente. Ajuste manualmente os campos.')
      return
    }

    setMappings(nextMappings)
    setError(null)
    const valueCount = suggestionMode === 'keys-and-values' ? suggested.values.length : 0
    setSuccess(`Mapeamentos sugeridos: ${suggested.keys.length} chave(s) e ${valueCount} valor(es).`)
    setResult(null)
  }

  const runComparison = () => {
    if (!baseDataset || !targetDataset) {
      setError('Selecione os dois arquivos para comparar.')
      return
    }

    if (!keyMappings.length) {
      setError('Informe ao menos um mapeamento do tipo chave para comparar os arquivos.')
      return
    }

    setError(null)
    setSuccess(null)
    setIsComparing(true)

    try {
      const invalidBaseFields = [...keyMappings, ...valueMappings]
        .map((mapping) => mapping.baseField)
        .filter((field, index, all) => all.indexOf(field) === index)
        .filter((field) => !baseDataset.headers.includes(field))

      const invalidTargetFields = [...keyMappings, ...valueMappings]
        .map((mapping) => mapping.targetField)
        .filter((field, index, all) => all.indexOf(field) === index)
        .filter((field) => !targetDataset.headers.includes(field))

      if (invalidBaseFields.length || invalidTargetFields.length) {
        const details: string[] = []
        if (invalidBaseFields.length) {
          details.push(`Campos nao encontrados no arquivo A: ${invalidBaseFields.join(', ')}`)
        }
        if (invalidTargetFields.length) {
          details.push(`Campos nao encontrados no arquivo B: ${invalidTargetFields.join(', ')}`)
        }
        throw new Error(details.join(' | '))
      }

      const nextResult = compareDatasets(baseDataset, targetDataset, keyMappings, valueMappings, valueTolerance)
      setResult(nextResult)
      setTypeFilter('all')
      setKeyFilter('')
      setResultPage(1)
      setSuccess(`Comparação concluída com ${nextResult.issues.length} divergência(s).`)
    } catch (comparisonError) {
      setResult(null)
      setError(toFriendlyError(comparisonError, 'Falha ao comparar os arquivos.'))
    } finally {
      setIsComparing(false)
    }
  }

  const exportExcel = () => {
    if (!result) {
      setError('Execute a comparação antes de exportar o Excel.')
      return
    }

    exportComparisonToExcel(result, filteredIssues)
  }

  return (
    <div className="estimativas-layout">
      <section className="card">
        <div className="estimativas-header-row">
          <div>
            <h2>Configurar Comparação</h2>
            <p className="muted">Selecione dois arquivos e monte os mapeamentos de campos em tempo de execucao.</p>
          </div>
        </div>

        <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '0.75rem' }}>
          <label className="file-input file-input--small">
            <input type="file" accept=".csv,.txt,.xlsx,.xls,.pdf" onChange={handleBaseFileChange} />
            <span>{isParsingBase ? 'Processando arquivo A...' : 'Selecionar arquivo A (base)'}</span>
          </label>

          <label className="file-input file-input--small">
            <input type="file" accept=".csv,.txt,.xlsx,.xls,.pdf" onChange={handleTargetFileChange} />
            <span>{isParsingTarget ? 'Processando arquivo B...' : 'Selecionar arquivo B (comparado)'}</span>
          </label>
        </div>

        {(baseDataset || targetDataset) && (
          <div className="estimativas-stats" style={{ marginTop: '0.15rem' }}>
            <span>Arquivo A: {baseDataset?.fileName || '-'}</span>
            <span>Colunas A: {baseDataset?.headers.length ?? 0}</span>
            <span>Linhas A: {baseDataset?.rows.length ?? 0}</span>
            <span>Arquivo B: {targetDataset?.fileName || '-'}</span>
            <span>Colunas B: {targetDataset?.headers.length ?? 0}</span>
            <span>Linhas B: {targetDataset?.rows.length ?? 0}</span>
          </div>
        )}

        <div className="estimativas-header-row" style={{ marginTop: '0.35rem' }}>
          <strong>Mapeamentos de Campos</strong>
          <div className="estimativas-actions">
            <label style={{ display: 'grid', gap: '0.2rem', minWidth: '220px' }}>
              <span className="muted" style={{ fontSize: '0.78rem' }}>Modo da sugestao</span>
              <select
                value={suggestionMode}
                onChange={(event) => setSuggestionMode(event.target.value as 'keys' | 'keys-and-values')}
              >
                <option value="keys">Somente chaves</option>
                <option value="keys-and-values">Chaves + valores</option>
              </select>
            </label>
            <button
              type="button"
              className="button-secondary"
              onClick={applySuggestedMappings}
              disabled={!baseDataset || !targetDataset || isParsingBase || isParsingTarget}
            >
              Sugerir mapeamentos
            </button>
            <button type="button" className="button-secondary" onClick={() => addMapping('key')}>
              Adicionar chave
            </button>
            <button type="button" className="button-secondary" onClick={() => addMapping('value')}>
              Adicionar valor
            </button>
          </div>
        </div>

        <div className="estimativas-table ch-table-theme" style={{ marginTop: '0.65rem' }}>
          <table>
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Campo arquivo A</th>
                <th>Campo arquivo B</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping) => (
                <tr key={mapping.id}>
                  <td>
                    <select
                      value={mapping.type}
                      onChange={(event) => updateMapping(mapping.id, { type: event.target.value as MappingType })}
                    >
                      <option value="key">Chave</option>
                      <option value="value">Valor</option>
                    </select>
                  </td>
                  <td>
                    <select
                      value={mapping.baseField}
                      onChange={(event) => updateMapping(mapping.id, { baseField: event.target.value })}
                    >
                      <option value="">Selecionar campo</option>
                      {(baseDataset?.headers || []).map((header) => (
                        <option key={`a-${mapping.id}-${header}`} value={header}>{header}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select
                      value={mapping.targetField}
                      onChange={(event) => updateMapping(mapping.id, { targetField: event.target.value })}
                    >
                      <option value="">Selecionar campo</option>
                      {(targetDataset?.headers || []).map((header) => (
                        <option key={`b-${mapping.id}-${header}`} value={header}>{header}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="estimativas-actions">
                      <button type="button" className="button-secondary" onClick={() => removeMapping(mapping.id)}>
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="estimativas-actions" style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            className="button-primary"
            onClick={runComparison}
            disabled={isComparing || isParsingBase || isParsingTarget || !baseDataset || !targetDataset}
          >
            {isComparing ? 'Comparando...' : 'Executar comparação'}
          </button>
          <button type="button" className="button-secondary" onClick={exportExcel} disabled={!result}>
            Gerar planilha Excel
          </button>
        </div>

        <label className="data-compare-field" style={{ marginTop: '0.75rem', maxWidth: '260px' }}>
          Tolerância para campos de valor
          <input
            type="number"
            min="0"
            step="0.01"
            value={valueTolerance}
            onChange={(event) => setValueTolerance(Number(event.target.value) || 0)}
          />
        </label>

        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
      </section>

      <section className="card">
        <div className="estimativas-header-row">
          <div>
            <h2>Resultado da Comparação</h2>
            <p className="muted">Visualize ausentes, extras e valores divergentes entre os arquivos A e B.</p>
          </div>
        </div>

        {!result ? (
          <p className="muted">Selecione os arquivos, configure os mapeamentos e execute a comparação.</p>
        ) : (
          <>
            <div className="estimativas-stats">
              <span>Ausentes no B: {result.summary.missingInTarget}</span>
              <span>Extras no B: {result.summary.extraInTarget}</span>
              <span>Valores divergentes: {result.summary.mismatches}</span>
              <span>Duplicadas A: {result.summary.duplicateKeysInBase}</span>
              <span>Duplicadas B: {result.summary.duplicateKeysInTarget}</span>
              <span>Total divergências: {result.issues.length}</span>
            </div>

            <div className="estimativas-filters">
              <label>
                Tipo de divergência
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as 'all' | IssueType)}>
                  <option value="all">Todos</option>
                  <option value="missing_in_target">Ausente no comparado</option>
                  <option value="extra_in_target">Extra no comparado</option>
                  <option value="value_mismatch">Valor divergente</option>
                  <option value="duplicate_key">Chave duplicada</option>
                </select>
              </label>

              <label>
                Filtro por chave
                <input
                  type="search"
                  value={keyFilter}
                  onChange={(event) => setKeyFilter(event.target.value)}
                  placeholder="Digite parte da chave"
                />
              </label>
            </div>

            <div className="estimativas-table ch-table-theme">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Chave</th>
                    <th>Mapeamento</th>
                    <th>Valor A</th>
                    <th>Valor B</th>
                    <th>Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {previewIssues.map((issue, index) => (
                    <tr key={`${issue.type}-${issue.key}-${issue.field}-${index}`}>
                      <td>{issueTypeLabel(issue.type)}</td>
                      <td>{issue.key}</td>
                      <td>{issue.field}</td>
                      <td>{issue.baseValue}</td>
                      <td>{issue.targetValue}</td>
                      <td>{issue.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalResultPages > 1 && (
              <div className="estimativas-actions" style={{ marginTop: '0.65rem', justifyContent: 'space-between' }}>
                <span className="muted">
                  Página {currentResultPage} de {totalResultPages} • {filteredIssues.length} registro(s)
                </span>
                <div className="estimativas-actions">
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setResultPage((prev) => Math.max(prev - 1, 1))}
                    disabled={currentResultPage <= 1}
                  >
                    Anterior
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setResultPage((prev) => Math.min(prev + 1, totalResultPages))}
                    disabled={currentResultPage >= totalResultPages}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}

            {!previewIssues.length && <p className="muted">Nenhuma divergência para os filtros selecionados.</p>}
            {filteredIssues.length > RESULT_PAGE_SIZE && (
              <p className="muted">Mostrando {previewIssues.length} de {filteredIssues.length} divergências.</p>
            )}
          </>
        )}
      </section>
    </div>
  )
}
