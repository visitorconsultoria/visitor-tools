import { jsPDF } from 'jspdf'
import { useMemo, useState, type ChangeEvent } from 'react'
import * as XLSX from 'xlsx'
import { apiUrl } from '../lib/api'

type DatasetRecord = {
  rowNumber: number
  values: Record<string, string>
}

type NormalizedDataset = {
  fileName: string
  headers: string[]
  records: DatasetRecord[]
}

type IssueType = 'missing_in_target' | 'extra_in_target' | 'value_mismatch' | 'duplicate_key'

type ComparisonIssue = {
  type: IssueType
  comparedFile: string
  key: string
  field: string
  baseValue: string
  targetValue: string
  detail: string
}

type FileComparisonSummary = {
  comparedFile: string
  missingInTarget: number
  extraInTarget: number
  mismatches: number
  duplicateKeys: number
}

type ComparisonResult = {
  keyFields: string[]
  baseFileName: string
  comparedFiles: string[]
  issues: ComparisonIssue[]
  summaries: FileComparisonSummary[]
  analyzedAt: string
}

type IssueFilter = 'all' | IssueType

type ComparisonMode = 'row' | 'aggregated'

type AggregatedGroupStatus = 'match' | 'missing_in_target' | 'extra_in_target' | 'divergent'

type AggregatedGroup = {
  key: string
  status: AggregatedGroupStatus
  baseTotal: number
  targetTotal: number
  difference: number
  baseCount: number
  targetCount: number
}

type AggregatedFileSummary = {
  comparedFile: string
  groups: AggregatedGroup[]
  totalDifference: number
  matchCount: number
  divergentCount: number
  missingCount: number
  extraCount: number
}

type AggregatedResult = {
  keyFields: string[]
  valueFields: string[]
  baseFileName: string
  comparedFiles: string[]
  fileSummaries: AggregatedFileSummary[]
  analyzedAt: string
}

type CopilotMissingItem = {
  key: string
  baseValue?: string
  baseTotal?: number
}

type CopilotAnalysisInputFile = {
  comparedFile: string
  missingCount: number
  missingValueTotal: number
  missingItems: CopilotMissingItem[]
}

type CopilotAnalysisInput = {
  comparisonMode: ComparisonMode
  baseFileName: string
  keyFields: string[]
  valueFields: string[]
  files: CopilotAnalysisInputFile[]
}

type CopilotAnalysisFileResult = {
  comparedFile: string
  diagnosis: string
  missingCount: number
  missingValueTotal: number
  topMissingKeys: string[]
  recommendations: string[]
}

type CopilotAnalysisResult = {
  resumoGeral: string
  arquivos: CopilotAnalysisFileResult[]
  alertas: string[]
  planoAcao: string[]
}

type NormalizationOptions = {
  trim: boolean
  collapseSpaces: boolean
  ignoreCase: boolean
  ignoreAccents: boolean
}

const PREVIEW_LIMIT = 8
const DELIMITER_CANDIDATES = [';', ',', '\t', '|']
const DEFAULT_NORMALIZATION: NormalizationOptions = {
  trim: true,
  collapseSpaces: true,
  ignoreCase: true,
  ignoreAccents: true,
}
const DEFAULT_NUMERIC_TOLERANCE = 0.01

function parseNumericValue(raw: string): number | null {
  const str = String(raw ?? '').trim().replace(/R\$\s*/g, '').replace(/%$/, '').trim()
  if (!str) return null

  // Detect Brazilian format: 1.234,56 (dot=thousands, comma=decimal)
  const brFormat = /^-?[\d.]+,\d{1,2}$/.test(str)
  if (brFormat) {
    const normalized = str.replace(/\./g, '').replace(',', '.')
    const parsed = parseFloat(normalized)
    return isFinite(parsed) ? parsed : null
  }

  // Detect US format: 1,234.56 (comma=thousands, dot=decimal)
  const usFormat = /^-?[\d,]+\.\d{1,2}$/.test(str)
  if (usFormat) {
    const normalized = str.replace(/,/g, '')
    const parsed = parseFloat(normalized)
    return isFinite(parsed) ? parsed : null
  }

  // Plain number
  const plain = str.replace(',', '.')
  const parsed = parseFloat(plain)
  return isFinite(parsed) ? parsed : null
}

function formatBrl(value: number): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function buildAggregatedIndex(
  records: DatasetRecord[],
  keyFields: string[],
  valueFields: string[],
  options: NormalizationOptions,
  fieldMapping?: FieldMapping[],
): Map<string, { total: number; count: number }> {
  const index = new Map<string, { total: number; count: number }>()

  records.forEach((record) => {
    const key = buildKey(record, keyFields, options, fieldMapping)
    if (!key) return

    let rowTotal = 0
    valueFields.forEach((field) => {
      const raw = record.values[field] ?? ''
      const parsed = parseNumericValue(raw)
      if (parsed !== null) rowTotal += parsed
    })

    const existing = index.get(key)
    if (existing) {
      existing.total += rowTotal
      existing.count += 1
    } else {
      index.set(key, { total: rowTotal, count: 1 })
    }
  })

  return index
}

function buildAggregatedResult(
  baseDataset: NormalizedDataset,
  targetDatasets: NormalizedDataset[],
  keyFields: string[],
  valueFields: string[],
  options: NormalizationOptions,
  allMappings: FileFieldMappings[],
  tolerance: number,
): AggregatedResult {
  const fileSummaries: AggregatedFileSummary[] = []

  const baseIndex = buildAggregatedIndex(baseDataset.records, keyFields, valueFields, options, undefined)

  targetDatasets.forEach((targetDataset) => {
    const targetMapping = allMappings.find((m) => m.fileName === targetDataset.fileName)?.mappings
    const targetIndex = buildAggregatedIndex(targetDataset.records, keyFields, valueFields, options, targetMapping)

    const groups: AggregatedGroup[] = []

    baseIndex.forEach(({ total: baseTotal, count: baseCount }, key) => {
      const targetEntry = targetIndex.get(key)
      if (!targetEntry) {
        groups.push({
          key,
          status: 'missing_in_target',
          baseTotal,
          targetTotal: 0,
          difference: -baseTotal,
          baseCount,
          targetCount: 0,
        })
        return
      }

      const diff = targetEntry.total - baseTotal
      const status: AggregatedGroupStatus = Math.abs(diff) <= tolerance ? 'match' : 'divergent'
      groups.push({
        key,
        status,
        baseTotal,
        targetTotal: targetEntry.total,
        difference: diff,
        baseCount,
        targetCount: targetEntry.count,
      })
    })

    targetIndex.forEach(({ total: targetTotal, count: targetCount }, key) => {
      if (baseIndex.has(key)) return
      groups.push({
        key,
        status: 'extra_in_target',
        baseTotal: 0,
        targetTotal,
        difference: targetTotal,
        baseCount: 0,
        targetCount,
      })
    })

    groups.sort((a, b) => a.key.localeCompare(b.key))

    const totalDifference = groups.reduce((sum, g) => sum + g.difference, 0)

    fileSummaries.push({
      comparedFile: targetDataset.fileName,
      groups,
      totalDifference,
      matchCount: groups.filter((g) => g.status === 'match').length,
      divergentCount: groups.filter((g) => g.status === 'divergent').length,
      missingCount: groups.filter((g) => g.status === 'missing_in_target').length,
      extraCount: groups.filter((g) => g.status === 'extra_in_target').length,
    })
  })

  return {
    keyFields,
    valueFields,
    baseFileName: baseDataset.fileName,
    comparedFiles: targetDatasets.map((d) => d.fileName),
    fileSummaries,
    analyzedAt: new Date().toISOString(),
  }
}

type FieldMapping = {
  baseField: string
  targetField: string
  confidence: number
}

type FileFieldMappings = {
  fileName: string
  mappings: FieldMapping[]
}

function levenshteinDistance(str1: string, str2: string): number {
  const a = str1.toLowerCase()
  const b = str2.toLowerCase()
  const matrix: number[][] = []

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }

  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
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

function stringSimilarity(str1: string, str2: string): number {
  const distance = levenshteinDistance(str1, str2)
  const maxLength = Math.max(str1.length, str2.length)
  if (maxLength === 0) return 1
  return 1 - distance / maxLength
}

function suggestFieldMappings(
  targetHeaders: string[],
  baseKeyFields: string[],
): FieldMapping[] {
  return baseKeyFields
    .map((baseField) => {
      const candidates = targetHeaders
        .map((targetField) => ({
          field: targetField,
          similarity: stringSimilarity(baseField, targetField),
        }))
        .sort((a, b) => b.similarity - a.similarity)

      const best = candidates[0]
      if (!best || best.similarity < 0.3) {
        return {
          baseField,
          targetField: '',
          confidence: 0,
        }
      }

      return {
        baseField,
        targetField: best.field,
        confidence: Math.round(best.similarity * 100),
      }
    })
    .sort((a, b) => (b.confidence - a.confidence))
}

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

function stripAccents(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
}

function normalizeForComparison(value: string, options: NormalizationOptions): string {
  let output = String(value ?? '')

  if (options.trim) output = output.trim()
  if (options.collapseSpaces) output = output.replace(/\s+/g, ' ')
  if (options.ignoreAccents) output = stripAccents(output)
  if (options.ignoreCase) output = output.toLowerCase()

  return output
}

function detectDelimiter(line: string): string | null {
  let winner: string | null = null
  let winnerCount = 0

  for (const delimiter of DELIMITER_CANDIDATES) {
    const count = line.split(delimiter).length - 1
    if (count > winnerCount) {
      winner = delimiter
      winnerCount = count
    }
  }

  return winnerCount > 0 ? winner : null
}

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === ',') {
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

      if (!inQuotes && char === delimiter) {
        output.push(current)
        current = ''
        continue
      }

      current += char
    }

    output.push(current)
    return output.map((value) => value.trim())
  }

  return line.split(delimiter).map((value) => value.trim())
}

function normalizeRowsToDataset(fileName: string, matrix: string[][]): NormalizedDataset {
  const cleanedRows = matrix
    .map((row) => row.map((cell) => normalizeCell(cell)))
    .filter((row) => row.some((cell) => cell.length > 0))

  if (!cleanedRows.length) {
    return { fileName, headers: [], records: [] }
  }

  const firstRow = cleanedRows[0]
  const headers = firstRow.map((cell, index) => normalizeHeader(cell || `coluna_${index + 1}`))
  const uniqueHeaders = headers.map((header, index) => {
    const duplicates = headers.slice(0, index).filter((item) => item === header).length
    return duplicates ? `${header}_${duplicates + 1}` : header
  })

  const records: DatasetRecord[] = cleanedRows.slice(1).map((row, rowIndex) => {
    const values: Record<string, string> = {}
    uniqueHeaders.forEach((header, index) => {
      values[header] = normalizeCell(row[index])
    })
    return {
      rowNumber: rowIndex + 2,
      values,
    }
  })

  return {
    fileName,
    headers: uniqueHeaders,
    records,
  }
}

function parseTextDataset(fileName: string, text: string): NormalizedDataset {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (!lines.length) return { fileName, headers: [], records: [] }

  const delimiter = detectDelimiter(lines[0])

  if (!delimiter) {
    return normalizeRowsToDataset(
      fileName,
      [['conteudo'], ...lines.map((line) => [line])],
    )
  }

  const matrix = lines.map((line) => splitLine(line, delimiter))
  return normalizeRowsToDataset(fileName, matrix)
}

async function parsePdfDataset(file: File): Promise<NormalizedDataset> {
  const pdfjs = await loadPdfjs()
  const data = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise
  const texts: string[] = []

  for (let page = 1; page <= pdf.numPages; page += 1) {
    const pageRef = await pdf.getPage(page)
    const content = await pageRef.getTextContent()
    const lines = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .map((item) => item.trim())
      .filter(Boolean)
    texts.push(lines.join(' '))
  }

  return parseTextDataset(file.name, texts.join('\n'))
}

async function parseFileDataset(file: File): Promise<NormalizedDataset> {
  const lowerName = file.name.toLowerCase()

  if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!firstSheet) return { fileName: file.name, headers: [], records: [] }

    const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(firstSheet, {
      header: 1,
      raw: false,
      defval: '',
    })
    const textMatrix = matrix.map((row) => row.map((cell) => String(cell ?? '')))
    return normalizeRowsToDataset(file.name, textMatrix)
  }

  if (lowerName.endsWith('.pdf')) {
    return parsePdfDataset(file)
  }

  const text = await file.text()
  return parseTextDataset(file.name, text)
}

function buildKey(
  record: DatasetRecord,
  keyFields: string[],
  options: NormalizationOptions,
  fieldMapping?: FieldMapping[],
): string | null {
  const fieldsToUse = fieldMapping
    ? fieldMapping
        .filter((m) => m.targetField)
        .map((m) => m.targetField)
    : keyFields

  const values = fieldsToUse.map((field) => normalizeForComparison(record.values[field], options))
  if (values.some((value) => !value)) return null
  return values.join(' | ')
}

function buildIndex(
  records: DatasetRecord[],
  keyFields: string[],
  options: NormalizationOptions,
  fieldMapping?: FieldMapping[],
): {
  rowByKey: Map<string, DatasetRecord>
  duplicateKeys: string[]
} {
  const rowByKey = new Map<string, DatasetRecord>()
  const duplicateKeys = new Set<string>()

  records.forEach((record) => {
    const key = buildKey(record, keyFields, options, fieldMapping)
    if (!key) return
    if (rowByKey.has(key)) {
      duplicateKeys.add(key)
      return
    }
    rowByKey.set(key, record)
  })

  return {
    rowByKey,
    duplicateKeys: [...duplicateKeys],
  }
}

function buildComparisonResult(
  baseDataset: NormalizedDataset,
  targetDatasets: NormalizedDataset[],
  keyFields: string[],
  options: NormalizationOptions,
  allMappings: FileFieldMappings[],
): ComparisonResult {
  const issues: ComparisonIssue[] = []
  const summaries: FileComparisonSummary[] = []

  const baseIndex = buildIndex(baseDataset.records, keyFields, options, undefined)

  targetDatasets.forEach((targetDataset) => {
    const targetMapping = allMappings.find((m) => m.fileName === targetDataset.fileName)?.mappings
    const targetIndex = buildIndex(targetDataset.records, keyFields, options, targetMapping)
    const sharedFields = baseDataset.headers
      .filter((field) => targetDataset.headers.includes(field))
      .filter((field) => !keyFields.includes(field))

    const summary: FileComparisonSummary = {
      comparedFile: targetDataset.fileName,
      missingInTarget: 0,
      extraInTarget: 0,
      mismatches: 0,
      duplicateKeys: 0,
    }

    if (baseIndex.duplicateKeys.length) {
      baseIndex.duplicateKeys.forEach((key) => {
        issues.push({
          type: 'duplicate_key',
          comparedFile: targetDataset.fileName,
          key,
          field: keyFields.join(', '),
          baseValue: key,
          targetValue: key,
          detail: `Chave duplicada no arquivo base: ${key}`,
        })
      })
      summary.duplicateKeys += baseIndex.duplicateKeys.length
    }

    if (targetIndex.duplicateKeys.length) {
      targetIndex.duplicateKeys.forEach((key) => {
        issues.push({
          type: 'duplicate_key',
          comparedFile: targetDataset.fileName,
          key,
          field: keyFields.join(', '),
          baseValue: key,
          targetValue: key,
          detail: `Chave duplicada no arquivo comparado: ${key}`,
        })
      })
      summary.duplicateKeys += targetIndex.duplicateKeys.length
    }

    baseIndex.rowByKey.forEach((baseRecord, key) => {
      const targetRecord = targetIndex.rowByKey.get(key)
      if (!targetRecord) {
        issues.push({
          type: 'missing_in_target',
          comparedFile: targetDataset.fileName,
          key,
          field: keyFields.join(', '),
          baseValue: key,
          targetValue: '',
          detail: 'Registro não encontrado no arquivo comparado.',
        })
        summary.missingInTarget += 1
        return
      }

      sharedFields.forEach((field) => {
        const baseValue = normalizeCell(baseRecord.values[field])
        const targetValue = normalizeCell(targetRecord.values[field])
        const normalizedBase = normalizeForComparison(baseValue, options)
        const normalizedTarget = normalizeForComparison(targetValue, options)
        if (normalizedBase === normalizedTarget) return

        issues.push({
          type: 'value_mismatch',
          comparedFile: targetDataset.fileName,
          key,
          field,
          baseValue,
          targetValue,
          detail: 'Valor divergente entre base e comparado.',
        })
        summary.mismatches += 1
      })
    })

    targetIndex.rowByKey.forEach((_targetRecord, key) => {
      if (baseIndex.rowByKey.has(key)) return
      issues.push({
        type: 'extra_in_target',
        comparedFile: targetDataset.fileName,
        key,
        field: keyFields.join(', '),
        baseValue: '',
        targetValue: key,
        detail: 'Registro existe no comparado, mas não está na base.',
      })
      summary.extraInTarget += 1
    })

    summaries.push(summary)
  })

  return {
    keyFields,
    baseFileName: baseDataset.fileName,
    comparedFiles: targetDatasets.map((item) => item.fileName),
    issues,
    summaries,
    analyzedAt: new Date().toISOString(),
  }
}

function toCsvLine(values: string[]): string {
  return values
    .map((value) => {
      const normalized = String(value ?? '')
      const escaped = normalized.replace(/"/g, '""')
      return /[";,\n\r]/.test(normalized) ? `"${escaped}"` : escaped
    })
    .join(';')
}

function downloadTextFile(fileName: string, content: string, contentType: string) {
  const blob = new Blob([content], { type: contentType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function issueTypeLabel(type: IssueType): string {
  if (type === 'missing_in_target') return 'Ausente no comparado'
  if (type === 'extra_in_target') return 'Extra no comparado'
  if (type === 'value_mismatch') return 'Valor divergente'
  return 'Chave duplicada'
}

function buildCopilotPrompt(result: ComparisonResult): string {
  const topIssues = result.issues.slice(0, 25)
  const summaryLines = result.summaries.map((item) => {
    return `- ${item.comparedFile}: ausentes=${item.missingInTarget}, extras=${item.extraInTarget}, divergencias=${item.mismatches}, duplicidades=${item.duplicateKeys}`
  })

  const issueLines = topIssues.map((issue) => {
    return `- arquivo=${issue.comparedFile}; tipo=${issueTypeLabel(issue.type)}; chave=${issue.key}; campo=${issue.field}; base=${issue.baseValue}; comparado=${issue.targetValue}`
  })

  return [
    'Analise as divergencias de dados abaixo e proponha causas provaveis e um plano de saneamento.',
    '',
    `Arquivo base: ${result.baseFileName}`,
    `Campos-chave: ${result.keyFields.join(', ')}`,
    `Total de arquivos comparados: ${result.comparedFiles.length}`,
    `Total de divergencias: ${result.issues.length}`,
    '',
    'Resumo por arquivo:',
    ...summaryLines,
    '',
    'Amostra de divergencias:',
    ...issueLines,
    '',
    'Quero como resposta:',
    '1) Diagnostico com as hipoteses mais provaveis por tipo de divergencia.',
    '2) Regras de validacao para evitar reincidencia.',
    '3) Checklist de acao para corrigir os dados origem e destino.',
  ].join('\n')
}

function buildAggregatedCopilotPrompt(result: AggregatedResult): string {
  const lines: string[] = [
    'Confira os dados financeiros abaixo e identifique as causas das divergencias, localize os registros faltantes e proponha um plano de correcao.',
    '',
    `Arquivo base: ${result.baseFileName}`,
    `Campos-chave: ${result.keyFields.join(', ')}`,
    `Campos de valor somados: ${result.valueFields.join(', ')}`,
    `Total de arquivos comparados: ${result.comparedFiles.length}`,
    '',
  ]

  result.fileSummaries.forEach((summary) => {
    lines.push(`=== Conferencia: ${summary.comparedFile} ===`)
    lines.push(
      `Resumo: OK=${summary.matchCount}, divergentes=${summary.divergentCount}, ausentes_no_comparado=${summary.missingCount}, extras_no_comparado=${summary.extraCount}`,
    )
    lines.push(`Diferenca total: R$ ${formatBrl(summary.totalDifference)}`)
    lines.push('')

    const divergent = summary.groups.filter((g) => g.status !== 'match')
    if (divergent.length) {
      lines.push('Grupos com divergencia:')
      divergent.forEach((g) => {
        const statusLabel =
          g.status === 'missing_in_target'
            ? 'AUSENTE no comparado'
            : g.status === 'extra_in_target'
              ? 'EXTRA no comparado'
              : 'VALOR DIVERGENTE'
        lines.push(
          `- ${g.key} | ${statusLabel} | base: R$ ${formatBrl(g.baseTotal)} (${g.baseCount} reg.) | comparado: R$ ${formatBrl(g.targetTotal)} (${g.targetCount} reg.) | diferenca: R$ ${formatBrl(g.difference)}`,
        )
      })
      lines.push('')
    }
  })

  lines.push('Quero como resposta:')
  lines.push('1) Diagnostico: para cada grupo com divergencia, quais registros provavelmente estao faltando ou incorretos.')
  lines.push('2) Localizacao: como identificar os registros individuais que causam a diferenca (campos de busca sugeridos).')
  lines.push('3) Plano de correcao: checklist para regularizar cada grupo divergente.')

  return lines.join('\n')
}

function exportAggregatedPdfReport(result: AggregatedResult) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40
  const lineHeight = 14
  let y = margin

  const writeLine = (text: string, fontSize = 10, isBold = false) => {
    if (y > pageHeight - margin) {
      doc.addPage()
      y = margin
    }
    doc.setFont('helvetica', isBold ? 'bold' : 'normal')
    doc.setFontSize(fontSize)
    const wrapped = doc.splitTextToSize(text, pageWidth - margin * 2)
    doc.text(wrapped, margin, y)
    y += wrapped.length * lineHeight
  }

  writeLine('Relatorio de Conferencia Financeira - Comparacao Consolidada', 13, true)
  y += 4
  writeLine(`Base: ${result.baseFileName}`)
  writeLine(`Campos-chave: ${result.keyFields.join(', ')}`)
  writeLine(`Campos de valor: ${result.valueFields.join(', ')}`)
  writeLine(`Arquivos comparados: ${result.comparedFiles.length}`)
  writeLine(`Analise realizada em: ${new Date(result.analyzedAt).toLocaleString('pt-BR')}`)
  y += 8

  result.fileSummaries.forEach((summary) => {
    writeLine(`Arquivo comparado: ${summary.comparedFile}`, 11, true)
    writeLine(
      `OK=${summary.matchCount} | Divergentes=${summary.divergentCount} | Ausentes=${summary.missingCount} | Extras=${summary.extraCount} | Diferenca total: R$ ${formatBrl(summary.totalDifference)}`,
    )
    y += 4

    summary.groups.forEach((g, i) => {
      const statusLabel =
        g.status === 'match'
          ? 'OK'
          : g.status === 'missing_in_target'
            ? 'AUSENTE'
            : g.status === 'extra_in_target'
              ? 'EXTRA'
              : 'DIVERGENTE'
      writeLine(
        `${i + 1}. [${statusLabel}] ${g.key} | Base: R$ ${formatBrl(g.baseTotal)} (${g.baseCount} reg.) | Comparado: R$ ${formatBrl(g.targetTotal)} (${g.targetCount} reg.) | Dif: R$ ${formatBrl(g.difference)}`,
      )
    })
    y += 8
  })

  const stamp = new Date().toISOString().slice(0, 10)
  doc.save(`relatorio-financeiro-${stamp}.pdf`)
}

function exportAggregatedCsvReport(result: AggregatedResult) {
  const header = toCsvLine(['arquivo', 'chave', 'status', 'qtd_base', 'qtd_comparado', 'valor_base', 'valor_comparado', 'diferenca'])
  const rows: string[] = []

  result.fileSummaries.forEach((summary) => {
    summary.groups.forEach((g) => {
      const statusLabel =
        g.status === 'match'
          ? 'OK'
          : g.status === 'missing_in_target'
            ? 'Ausente no comparado'
            : g.status === 'extra_in_target'
              ? 'Extra no comparado'
              : 'Valor divergente'
      rows.push(
        toCsvLine([
          summary.comparedFile,
          g.key,
          statusLabel,
          String(g.baseCount),
          String(g.targetCount),
          formatBrl(g.baseTotal),
          formatBrl(g.targetTotal),
          formatBrl(g.difference),
        ]),
      )
    })
  })

  const csv = [header, ...rows].join('\n') + '\n'
  const stamp = new Date().toISOString().slice(0, 10)
  downloadTextFile(`relatorio-financeiro-${stamp}.csv`, csv, 'text/csv;charset=utf-8;')
}

function buildCopilotAnalysisInput(
  mode: ComparisonMode,
  rowResult: ComparisonResult | null,
  aggResult: AggregatedResult | null,
): CopilotAnalysisInput | null {
  if (mode === 'aggregated') {
    if (!aggResult) return null

    const files: CopilotAnalysisInputFile[] = aggResult.fileSummaries.map((summary) => {
      const missingGroups = summary.groups.filter((g) => g.status === 'missing_in_target')
      return {
        comparedFile: summary.comparedFile,
        missingCount: missingGroups.length,
        missingValueTotal: missingGroups.reduce((sum, g) => sum + g.baseTotal, 0),
        missingItems: missingGroups.slice(0, 60).map((g) => ({
          key: g.key,
          baseTotal: g.baseTotal,
        })),
      }
    })

    return {
      comparisonMode: mode,
      baseFileName: aggResult.baseFileName,
      keyFields: aggResult.keyFields,
      valueFields: aggResult.valueFields,
      files,
    }
  }

  if (!rowResult) return null

  const files: CopilotAnalysisInputFile[] = rowResult.summaries.map((summary) => {
    const missingRows = rowResult.issues.filter(
      (issue) => issue.comparedFile === summary.comparedFile && issue.type === 'missing_in_target',
    )
    return {
      comparedFile: summary.comparedFile,
      missingCount: missingRows.length,
      missingValueTotal: 0,
      missingItems: missingRows.slice(0, 60).map((issue) => ({
        key: issue.key,
        baseValue: issue.baseValue,
      })),
    }
  })

  return {
    comparisonMode: mode,
    baseFileName: rowResult.baseFileName,
    keyFields: rowResult.keyFields,
    valueFields: [],
    files,
  }
}

async function analyzeDataComparisonWithCopilot(
  payload: CopilotAnalysisInput,
): Promise<CopilotAnalysisResult> {
  const response = await fetch(apiUrl('/api/data-comparison/analyze'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    let detail = 'Falha ao executar analise com Copilot.'
    try {
      const err = await response.json()
      detail = (err as { error?: string })?.error ?? response.statusText
    } catch {
      detail = response.statusText
    }
    throw new Error(`Erro ${response.status}: ${detail}`)
  }

  const parsed = await response.json() as Partial<CopilotAnalysisResult>

  return {
    resumoGeral: typeof parsed.resumoGeral === 'string' ? parsed.resumoGeral : '',
    arquivos: Array.isArray(parsed.arquivos)
      ? parsed.arquivos.map((item) => ({
        comparedFile: typeof item?.comparedFile === 'string' ? item.comparedFile : 'arquivo',
        diagnosis: typeof item?.diagnosis === 'string' ? item.diagnosis : '',
        missingCount: typeof item?.missingCount === 'number' ? item.missingCount : 0,
        missingValueTotal: typeof item?.missingValueTotal === 'number' ? item.missingValueTotal : 0,
        topMissingKeys: Array.isArray(item?.topMissingKeys) ? item.topMissingKeys.slice(0, 8).map(String) : [],
        recommendations: Array.isArray(item?.recommendations)
          ? item.recommendations.slice(0, 5).map(String)
          : [],
      }))
      : [],
    alertas: Array.isArray(parsed.alertas) ? parsed.alertas.slice(0, 8).map(String) : [],
    planoAcao: Array.isArray(parsed.planoAcao) ? parsed.planoAcao.slice(0, 8).map(String) : [],
  }
}

function toReportRows(issues: ComparisonIssue[]): string[][] {
  return issues.map((issue) => [
    issue.comparedFile,
    issueTypeLabel(issue.type),
    issue.key,
    issue.field,
    issue.baseValue,
    issue.targetValue,
    issue.detail,
  ])
}

function exportPdfReport(
  result: ComparisonResult,
  issues: ComparisonIssue[],
  selectedType: IssueFilter,
  selectedFile: string,
) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40
  const lineHeight = 14
  let y = margin

  const writeLine = (text: string, fontSize = 10, isBold = false) => {
    if (y > pageHeight - margin) {
      doc.addPage()
      y = margin
    }

    doc.setFont('helvetica', isBold ? 'bold' : 'normal')
    doc.setFontSize(fontSize)
    const wrapped = doc.splitTextToSize(text, pageWidth - margin * 2)
    doc.text(wrapped, margin, y)
    y += wrapped.length * lineHeight
  }

  writeLine('Relatorio de Divergencias - Comparacao de Dados', 13, true)
  y += 4
  writeLine(`Base: ${result.baseFileName}`)
  writeLine(`Campos-chave: ${result.keyFields.join(', ')}`)
  writeLine(`Arquivos comparados: ${result.comparedFiles.length}`)
  writeLine(`Divergencias no filtro: ${issues.length}`)
  writeLine(`Filtro por tipo: ${selectedType === 'all' ? 'Todos' : issueTypeLabel(selectedType)}`)
  writeLine(`Filtro por arquivo: ${selectedFile === 'all' ? 'Todos' : selectedFile}`)
  writeLine(`Analise realizada em: ${new Date(result.analyzedAt).toLocaleString('pt-BR')}`)
  y += 6

  result.summaries.forEach((summary) => {
    writeLine(
      `Resumo ${summary.comparedFile}: ausentes=${summary.missingInTarget}, extras=${summary.extraInTarget}, divergencias=${summary.mismatches}, duplicidades=${summary.duplicateKeys}`,
    )
  })

  y += 8
  writeLine('Divergencias detalhadas', 11, true)

  if (!issues.length) {
    writeLine('Nenhuma divergencia encontrada para os filtros selecionados.')
  } else {
    issues.forEach((issue, index) => {
      writeLine(
        `${index + 1}. [${issueTypeLabel(issue.type)}] arquivo=${issue.comparedFile}; chave=${issue.key}; campo=${issue.field}; base=${issue.baseValue}; comparado=${issue.targetValue}`,
      )
    })
  }

  const stamp = new Date().toISOString().slice(0, 10)
  doc.save(`relatorio-divergencias-${stamp}.pdf`)
}

export default function DataComparisonTool() {
  const [baseFile, setBaseFile] = useState<File | null>(null)
  const [comparisonFiles, setComparisonFiles] = useState<File[]>([])
  const [keyFieldsInput, setKeyFieldsInput] = useState('')
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('row')
  const [valueFieldsInput, setValueFieldsInput] = useState('')
  const [numericTolerance, setNumericTolerance] = useState(DEFAULT_NUMERIC_TOLERANCE)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ComparisonResult | null>(null)
  const [aggregatedResult, setAggregatedResult] = useState<AggregatedResult | null>(null)
  const [copilotPrompt, setCopilotPrompt] = useState('')
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [executedPrompt, setExecutedPrompt] = useState(false)
  const [copilotAnalysis, setCopilotAnalysis] = useState<CopilotAnalysisResult | null>(null)
  const [isAnalyzingCopilot, setIsAnalyzingCopilot] = useState(false)
  const [copilotAnalysisError, setCopilotAnalysisError] = useState<string | null>(null)
  const [isExecutePromptModalOpen, setIsExecutePromptModalOpen] = useState(false)
  const [typeFilter, setTypeFilter] = useState<IssueFilter>('all')
  const [fileFilter, setFileFilter] = useState<string>('all')
  const [aggFileFilter, setAggFileFilter] = useState<string>('all')
  const [aggStatusFilter, setAggStatusFilter] = useState<AggregatedGroupStatus | 'all'>('all')
  const [normalization, setNormalization] = useState<NormalizationOptions>(DEFAULT_NORMALIZATION)
  const [baseDataset, setBaseDataset] = useState<NormalizedDataset | null>(null)
  const [comparisonDatasets, setComparisonDatasets] = useState<NormalizedDataset[]>([])
  const [fieldMappings, setFieldMappings] = useState<FileFieldMappings[]>([])
  const [showMappingPanel, setShowMappingPanel] = useState(false)

  const parsedKeyFields = useMemo(() => {
    return Array.from(
      new Set(
        keyFieldsInput
          .split(',')
          .map((item) => normalizeHeader(item))
          .filter(Boolean),
      ),
    )
  }, [keyFieldsInput])

  const parsedValueFields = useMemo(() => {
    return Array.from(
      new Set(
        valueFieldsInput
          .split(',')
          .map((item) => normalizeHeader(item))
          .filter(Boolean),
      ),
    )
  }, [valueFieldsInput])

  const filteredIssues = useMemo(() => {
    if (!result) return []

    return result.issues.filter((issue) => {
      if (typeFilter !== 'all' && issue.type !== typeFilter) return false
      if (fileFilter !== 'all' && issue.comparedFile !== fileFilter) return false
      return true
    })
  }, [fileFilter, result, typeFilter])

  const issuePreview = useMemo(() => filteredIssues.slice(0, PREVIEW_LIMIT), [filteredIssues])

  const fileFilterOptions = useMemo(() => result?.comparedFiles ?? [], [result])

  const aggFileSummaries = useMemo(() => {
    if (!aggregatedResult) return []
    if (aggFileFilter === 'all') return aggregatedResult.fileSummaries
    return aggregatedResult.fileSummaries.filter((s) => s.comparedFile === aggFileFilter)
  }, [aggregatedResult, aggFileFilter])

  const aggFileFilterOptions = useMemo(() => aggregatedResult?.comparedFiles ?? [], [aggregatedResult])

  const handleBaseFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null
    setBaseFile(selected)
    setResult(null)
    setAggregatedResult(null)
    setCopilotPrompt('')
    setError(null)
    setCopiedPrompt(false)
    setExecutedPrompt(false)
    setCopilotAnalysis(null)
    setCopilotAnalysisError(null)
    setIsExecutePromptModalOpen(false)
    setTypeFilter('all')
    setFileFilter('all')
    setAggFileFilter('all')
    setAggStatusFilter('all')
  }

  const handleComparisonFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? [])
    setComparisonFiles(selectedFiles)
    setResult(null)
    setAggregatedResult(null)
    setCopilotPrompt('')
    setError(null)
    setCopiedPrompt(false)
    setExecutedPrompt(false)
    setCopilotAnalysis(null)
    setCopilotAnalysisError(null)
    setIsExecutePromptModalOpen(false)
    setTypeFilter('all')
    setFileFilter('all')
    setAggFileFilter('all')
    setAggStatusFilter('all')
  }

  const handleCompare = async () => {
    if (!baseFile) {
      setError('Selecione o arquivo base para iniciar a comparação.')
      return
    }

    if (!comparisonFiles.length) {
      setError('Selecione ao menos um arquivo para comparar com a base.')
      return
    }

    if (!parsedKeyFields.length) {
      setError('Informe pelo menos um campo-chave separado por vírgula.')
      return
    }

    if (comparisonMode === 'aggregated' && !parsedValueFields.length) {
      setError('No modo financeiro, informe os campos de valor separados por vírgula.')
      return
    }

    setIsProcessing(true)
    setError(null)
    setCopiedPrompt(false)
    setExecutedPrompt(false)
    setCopilotAnalysis(null)
    setCopilotAnalysisError(null)
    setIsExecutePromptModalOpen(false)

    try {
      const newBaseDataset = await parseFileDataset(baseFile)
      const newTargetDatasets = await Promise.all(comparisonFiles.map((file) => parseFileDataset(file)))

      const missingKeys = parsedKeyFields.filter((key) => !newBaseDataset.headers.includes(key))
      if (missingKeys.length) {
        throw new Error(`Os campos-chave não existem no arquivo base: ${missingKeys.join(', ')}`)
      }

      if (comparisonMode === 'aggregated') {
        const missingValues = parsedValueFields.filter((v) => !newBaseDataset.headers.includes(v))
        if (missingValues.length) {
          throw new Error(`Os campos de valor não existem no arquivo base: ${missingValues.join(', ')}`)
        }
      }

      setBaseDataset(newBaseDataset)
      setComparisonDatasets(newTargetDatasets)

      const newMappings: FileFieldMappings[] = newTargetDatasets.map((dataset) => ({
        fileName: dataset.fileName,
        mappings: suggestFieldMappings(dataset.headers, parsedKeyFields),
      }))

      setFieldMappings(newMappings)
      setShowMappingPanel(true)
    } catch (comparisonError) {
      const detail = comparisonError instanceof Error ? comparisonError.message : 'Erro ao comparar arquivos.'
      setError(detail)
    } finally {
      setIsProcessing(false)
    }
  }

  const handleExecuteComparison = () => {
    if (!baseDataset || !comparisonDatasets.length) {
      setError('Erro ao executar comparação: datasets não carregados.')
      return
    }

    try {
      if (comparisonMode === 'aggregated') {
        const builtResult = buildAggregatedResult(
          baseDataset,
          comparisonDatasets,
          parsedKeyFields,
          parsedValueFields,
          normalization,
          fieldMappings,
          numericTolerance,
        )
        setAggregatedResult(builtResult)
        setResult(null)
        setCopilotPrompt(buildAggregatedCopilotPrompt(builtResult))
        setExecutedPrompt(false)
        setCopilotAnalysis(null)
        setCopilotAnalysisError(null)
        setIsExecutePromptModalOpen(false)
      } else {
        const builtResult = buildComparisonResult(
          baseDataset,
          comparisonDatasets,
          parsedKeyFields,
          normalization,
          fieldMappings,
        )
        setResult(builtResult)
        setAggregatedResult(null)
        setCopilotPrompt(buildCopilotPrompt(builtResult))
        setExecutedPrompt(false)
        setCopilotAnalysis(null)
        setCopilotAnalysisError(null)
        setIsExecutePromptModalOpen(false)
      }
      setTypeFilter('all')
      setFileFilter('all')
      setAggFileFilter('all')
      setAggStatusFilter('all')
      setShowMappingPanel(false)
    } catch (comparisonError) {
      const detail = comparisonError instanceof Error ? comparisonError.message : 'Erro ao comparar arquivos.'
      setError(detail)
      setResult(null)
      setAggregatedResult(null)
      setCopilotPrompt('')
      setExecutedPrompt(false)
      setCopilotAnalysis(null)
      setCopilotAnalysisError(null)
      setIsExecutePromptModalOpen(false)
    }
  }

  const handleMappingChange = (fileIndex: number, fieldIndex: number, newTargetField: string) => {
    setFieldMappings((prev) => {
      const updated = [...prev]
      if (updated[fileIndex]) {
        updated[fileIndex] = {
          ...updated[fileIndex],
          mappings: updated[fileIndex].mappings.map((mapping, idx) => {
            if (idx === fieldIndex) {
              return { ...mapping, targetField: newTargetField }
            }
            return mapping
          }),
        }
      }
      return updated
    })
  }

  const handleExportReport = () => {
    if (comparisonMode === 'aggregated') {
      if (!aggregatedResult) return
      exportAggregatedCsvReport(aggregatedResult)
      return
    }
    if (!result) return

    const header = ['arquivo', 'tipo', 'chave', 'campo', 'valor_base', 'valor_comparado', 'detalhe']
    const rows = toReportRows(filteredIssues)

    const csv = [header, ...rows].map((line) => toCsvLine(line)).join('\n') + '\n'
    const stamp = new Date().toISOString().slice(0, 10)
    downloadTextFile(`relatorio-divergencias-${stamp}.csv`, csv, 'text/csv;charset=utf-8;')
  }

  const handleExportPdfReport = () => {
    if (comparisonMode === 'aggregated') {
      if (!aggregatedResult) return
      exportAggregatedPdfReport(aggregatedResult)
      return
    }
    if (!result) return
    exportPdfReport(result, filteredIssues, typeFilter, fileFilter)
  }

  const handleCopyCopilotPrompt = async () => {
    if (!copilotPrompt.trim()) return

    try {
      await navigator.clipboard.writeText(copilotPrompt)
      setCopiedPrompt(true)
      window.setTimeout(() => setCopiedPrompt(false), 1800)
    } catch {
      setCopiedPrompt(false)
    }
  }

  const handleExecuteCopilotPrompt = async () => {
    if (!copilotPrompt.trim()) return

    setIsExecutePromptModalOpen(true)
  }

  const handleConfirmExecuteCopilotPrompt = async () => {
    if (!copilotPrompt.trim()) {
      setIsExecutePromptModalOpen(false)
      return
    }

    const analysisInput = buildCopilotAnalysisInput(comparisonMode, result, aggregatedResult)
    if (!analysisInput) {
      setIsExecutePromptModalOpen(false)
      setCopilotAnalysisError('Execute a comparacao antes de rodar a analise com Copilot.')
      return
    }

    setIsExecutePromptModalOpen(false)
    setIsAnalyzingCopilot(true)
    setCopilotAnalysisError(null)
    setExecutedPrompt(false)

    try {
      const analysis = await analyzeDataComparisonWithCopilot(analysisInput)
      setCopilotAnalysis(analysis)
      setExecutedPrompt(true)
      setCopiedPrompt(false)
      window.setTimeout(() => {
        setExecutedPrompt(false)
      }, 2200)
    } catch (analysisError) {
      const detail = analysisError instanceof Error ? analysisError.message : 'Falha ao analisar com Copilot.'
      setCopilotAnalysisError(detail)
      setExecutedPrompt(false)
      setCopiedPrompt(false)
      setCopilotAnalysis(null)
    } finally {
      setIsAnalyzingCopilot(false)
    }
  }

  const handleCancelExecuteCopilotPrompt = () => {
    setIsExecutePromptModalOpen(false)
    setExecutedPrompt(false)
  }

  return (
    <div className="grid data-compare-layout">
      <section className="card">
        <h2>1) Fonte e chave da comparação</h2>
        <div className="controls">
          <label className="file-input">
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              onChange={handleBaseFileChange}
            />
            <span>Selecionar arquivo base</span>
          </label>
          {baseFile && <span className="muted">Base: {baseFile.name}</span>}
        </div>

        <div className="controls">
          <label className="file-input">
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.txt,.pdf"
              multiple
              onChange={handleComparisonFilesChange}
            />
            <span>Selecionar arquivos para comparar</span>
          </label>
          {comparisonFiles.length > 0 && (
            <span className="muted">Arquivos: {comparisonFiles.length}</span>
          )}
        </div>

        <label className="data-compare-field">
          Campos-chave (separados por vírgula)
          <input
            type="text"
            value={keyFieldsInput}
            onChange={(event) => setKeyFieldsInput(event.target.value)}
            placeholder="ex.: codigo_cliente, filial, documento"
          />
        </label>

        <div className="data-compare-normalization">
          <span className="data-compare-normalization__title">Modo de comparação</span>
          <label className="checkbox">
            <input
              type="radio"
              name="comparisonMode"
              value="row"
              checked={comparisonMode === 'row'}
              onChange={() => setComparisonMode('row')}
            />
            Por registro — compara linha a linha pelos campos-chave
          </label>
          <label className="checkbox">
            <input
              type="radio"
              name="comparisonMode"
              value="aggregated"
              checked={comparisonMode === 'aggregated'}
              onChange={() => setComparisonMode('aggregated')}
            />
            Financeiro / Consolidado — soma valores por chave e compara totais
          </label>
        </div>

        {comparisonMode === 'aggregated' && (
          <>
            <label className="data-compare-field">
              Campos de valor a somar (separados por vírgula)
              <input
                type="text"
                value={valueFieldsInput}
                onChange={(event) => setValueFieldsInput(event.target.value)}
                placeholder="ex.: valor, deprec, saldo"
              />
            </label>
            <label className="data-compare-field">
              Tolerância numérica (diferença máxima aceita como igualdade)
              <input
                type="number"
                step="0.01"
                min="0"
                value={numericTolerance}
                onChange={(event) => setNumericTolerance(Number(event.target.value))}
              />
            </label>
          </>
        )}

        <div className="data-compare-normalization">
          <span className="data-compare-normalization__title">Normalização avançada</span>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={normalization.trim}
              onChange={(event) => setNormalization((prev) => ({ ...prev, trim: event.target.checked }))}
            />
            Remover espaços no início/fim
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={normalization.collapseSpaces}
              onChange={(event) => setNormalization((prev) => ({ ...prev, collapseSpaces: event.target.checked }))}
            />
            Unificar múltiplos espaços internos
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={normalization.ignoreCase}
              onChange={(event) => setNormalization((prev) => ({ ...prev, ignoreCase: event.target.checked }))}
            />
            Ignorar diferença entre maiúsculas/minúsculas
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={normalization.ignoreAccents}
              onChange={(event) => setNormalization((prev) => ({ ...prev, ignoreAccents: event.target.checked }))}
            />
            Ignorar acentos
          </label>
        </div>

        <p className="muted">
          Suporta base em Excel/CSV/TXT e comparação em Excel/CSV/TXT/PDF.
          Para PDF, a comparação usa o texto extraído e pode exigir ajuste de chaves.
        </p>

        <div className="results__actions">
          <button type="button" className="button-primary" onClick={handleCompare} disabled={isProcessing}>
            {isProcessing ? 'Comparando...' : 'Comparar arquivos'}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={handleExportReport}
            disabled={comparisonMode === 'aggregated' ? !aggregatedResult : !result}
          >
            Gerar relatório CSV
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={handleExportPdfReport}
            disabled={comparisonMode === 'aggregated' ? !aggregatedResult : !result}
          >
            Gerar relatório PDF
          </button>
        </div>

        {error && <p className="error">{error}</p>}
      </section>

      {showMappingPanel && baseDataset && comparisonDatasets.length > 0 && (
        <section className="card data-compare-mapping-panel">
          <h2>Mapeamento de campos-chave</h2>
          <p className="muted">
            Os campos-chave podem ter nomes diferentes nos arquivos. Revise e ajuste o mapeamento detectado automaticamente.
          </p>

          {fieldMappings.map((fileMapping, fileIndex) => (
            <div key={fileMapping.fileName} className="data-compare-mapping-file">
              <h3>{fileMapping.fileName}</h3>
              <div className="data-compare-mapping-grid">
                {fileMapping.mappings.map((mapping, fieldIndex) => (
                  <div key={`${fileMapping.fileName}-${mapping.baseField}`} className="data-compare-mapping-row">
                    <div className="data-compare-mapping-base">
                      <label>Campo base</label>
                      <input type="text" value={mapping.baseField} readOnly />
                    </div>
                    <div className="data-compare-mapping-arrow">→</div>
                    <div className="data-compare-mapping-target">
                      <label>
                        Campo comparado
                        {mapping.confidence > 0 && (
                          <span className="data-compare-confidence">
                            ({mapping.confidence}% confiança)
                          </span>
                        )}
                      </label>
                      <select
                        value={mapping.targetField}
                        onChange={(e) => handleMappingChange(fileIndex, fieldIndex, e.target.value)}
                      >
                        <option value="">-- Selecionar --</option>
                        {comparisonDatasets[fileIndex]?.headers.map((header) => (
                          <option key={header} value={header}>
                            {header}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="results__actions">
            <button type="button" className="button-primary" onClick={handleExecuteComparison}>
              Executar comparação com mapeamento
            </button>
            <button type="button" className="button-secondary" onClick={() => setShowMappingPanel(false)}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      <section className="card">
        <h2>2) Resultado da comparação</h2>

        {!result && !aggregatedResult && <p className="muted">Execute a comparação para visualizar divergências.</p>}

        {aggregatedResult && (
          <>
            <div className="data-compare-summary">
              <span><strong>Base:</strong> {aggregatedResult.baseFileName}</span>
              <span><strong>Chaves:</strong> {aggregatedResult.keyFields.join(', ')}</span>
              <span><strong>Valores:</strong> {aggregatedResult.valueFields.join(', ')}</span>
            </div>

            <div className="data-compare-filters">
              <label>
                Arquivo comparado
                <select value={aggFileFilter} onChange={(event) => setAggFileFilter(event.target.value)}>
                  <option value="all">Todos</option>
                  {aggFileFilterOptions.map((fileName) => (
                    <option key={fileName} value={fileName}>{fileName}</option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  value={aggStatusFilter}
                  onChange={(event) => setAggStatusFilter(event.target.value as AggregatedGroupStatus | 'all')}
                >
                  <option value="all">Todos</option>
                  <option value="divergent">Valor divergente</option>
                  <option value="missing_in_target">Ausente no comparado</option>
                  <option value="extra_in_target">Extra no comparado</option>
                  <option value="match">OK</option>
                </select>
              </label>
            </div>

            {aggFileSummaries.map((summary) => {
              const groups =
                aggStatusFilter === 'all'
                  ? summary.groups
                  : summary.groups.filter((g) => g.status === aggStatusFilter)
              return (
                <div key={summary.comparedFile} className="data-compare-agg-file">
                  <div className="data-compare-agg-file__header">
                    <strong>{summary.comparedFile}</strong>
                    <span className="data-compare-agg-stats">
                      <span className="badge badge--success">OK: {summary.matchCount}</span>
                      {summary.divergentCount > 0 && (
                        <span className="badge badge--error">Divergentes: {summary.divergentCount}</span>
                      )}
                      {summary.missingCount > 0 && (
                        <span className="badge badge--warning">Ausentes: {summary.missingCount}</span>
                      )}
                      {summary.extraCount > 0 && (
                        <span className="badge badge--info">Extras: {summary.extraCount}</span>
                      )}
                    </span>
                    <span className={`data-compare-agg-total ${Math.abs(summary.totalDifference) > 0 ? 'data-compare-agg-total--diff' : ''}`}>
                      Diferença total: R$ {formatBrl(summary.totalDifference)}
                    </span>
                  </div>

                  <div className="csv-table data-compare-agg-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Chave</th>
                          <th>Status</th>
                          <th>Qtd Base</th>
                          <th>Qtd Comp.</th>
                          <th>Valor Base (R$)</th>
                          <th>Valor Comp. (R$)</th>
                          <th>Diferença (R$)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map((g) => {
                          const statusClass =
                            g.status === 'match'
                              ? 'agg-row--ok'
                              : g.status === 'divergent'
                                ? 'agg-row--diff'
                                : g.status === 'missing_in_target'
                                  ? 'agg-row--missing'
                                  : 'agg-row--extra'
                          const statusLabel =
                            g.status === 'match'
                              ? 'OK'
                              : g.status === 'divergent'
                                ? 'Divergente'
                                : g.status === 'missing_in_target'
                                  ? 'Ausente'
                                  : 'Extra'
                          return (
                            <tr key={g.key} className={statusClass}>
                              <td>{g.key}</td>
                              <td>{statusLabel}</td>
                              <td>{g.baseCount}</td>
                              <td>{g.targetCount}</td>
                              <td className="agg-value">{formatBrl(g.baseTotal)}</td>
                              <td className="agg-value">{formatBrl(g.targetTotal)}</td>
                              <td className={`agg-value ${g.difference !== 0 ? 'agg-value--diff' : ''}`}>
                                {g.difference > 0 ? '+' : ''}{formatBrl(g.difference)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  {!groups.length && <p className="muted">Nenhum grupo para os filtros selecionados.</p>}
                </div>
              )
            })}
          </>
        )}

        {result && (
          <>
            <div className="data-compare-summary">
              <span><strong>Base:</strong> {result.baseFileName}</span>
              <span><strong>Campos-chave:</strong> {result.keyFields.join(', ')}</span>
              <span><strong>Divergências (filtro):</strong> {filteredIssues.length}</span>
              <span><strong>Divergências (total):</strong> {result.issues.length}</span>
            </div>

            <div className="data-compare-filters">
              <label>
                Tipo de divergência
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as IssueFilter)}>
                  <option value="all">Todos</option>
                  <option value="missing_in_target">Ausente no comparado</option>
                  <option value="extra_in_target">Extra no comparado</option>
                  <option value="value_mismatch">Valor divergente</option>
                  <option value="duplicate_key">Chave duplicada</option>
                </select>
              </label>
              <label>
                Arquivo comparado
                <select value={fileFilter} onChange={(event) => setFileFilter(event.target.value)}>
                  <option value="all">Todos</option>
                  {fileFilterOptions.map((fileName) => (
                    <option key={fileName} value={fileName}>{fileName}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="csv-table">
              <table>
                <thead>
                  <tr>
                    <th>Arquivo</th>
                    <th>Ausentes</th>
                    <th>Extras</th>
                    <th>Divergências</th>
                    <th>Duplicidades</th>
                  </tr>
                </thead>
                <tbody>
                  {result.summaries.map((summary) => (
                    <tr key={summary.comparedFile}>
                      <td>{summary.comparedFile}</td>
                      <td>{summary.missingInTarget}</td>
                      <td>{summary.extraInTarget}</td>
                      <td>{summary.mismatches}</td>
                      <td>{summary.duplicateKeys}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="results">
              <div className="results__header">
                <strong>Pré-visualização de divergências</strong>
                <span className="muted">Mostrando até {PREVIEW_LIMIT} itens após filtros</span>
              </div>
              <ul>
                {issuePreview.map((issue, index) => (
                  <li key={`${issue.comparedFile}-${issue.key}-${issue.field}-${index}`}>
                    <span className="badge">{issueTypeLabel(issue.type)}</span>
                    <span>
                      <strong>{issue.comparedFile}</strong> | chave: {issue.key} | campo: {issue.field}
                    </span>
                  </li>
                ))}
              </ul>
              {!filteredIssues.length && <p className="muted">Nenhuma divergência para os filtros selecionados.</p>}
            </div>
          </>
        )}
      </section>

      <section className="card data-compare-copilot">
        <h2>3) Análise com GitHub Copilot</h2>
        <p className="muted">
          Execute a analise com Copilot para identificar valores do arquivo base ausentes nos arquivos comparados.
        </p>

        <textarea
          value={copilotPrompt}
          readOnly
          rows={12}
          placeholder="Após comparar os arquivos, o prompt para Copilot aparecerá aqui."
        />

        <div className="results__actions">
          <button
            type="button"
            className="button-primary"
            onClick={handleExecuteCopilotPrompt}
            disabled={!copilotPrompt.trim() || isAnalyzingCopilot}
          >
            {isAnalyzingCopilot ? 'Analisando com Copilot...' : 'Executar análise Copilot'}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={handleCopyCopilotPrompt}
            disabled={!copilotPrompt.trim()}
          >
            Copiar prompt para Copilot
          </button>
          {executedPrompt && <span className="success">Análise executada com sucesso.</span>}
          {!executedPrompt && copiedPrompt && <span className="success">Prompt copiado.</span>}
        </div>

        {copilotAnalysisError && <p className="error">{copilotAnalysisError}</p>}

        {copilotAnalysis && (
          <div className="results" style={{ marginTop: '0.85rem' }}>
            <div className="results__header">
              <strong>Diagnóstico do Copilot</strong>
            </div>
            <p style={{ marginTop: '0.2rem' }}>{copilotAnalysis.resumoGeral || 'Sem resumo retornado.'}</p>

            {!!copilotAnalysis.arquivos.length && (
              <div className="data-compare-ai-cards">
                {copilotAnalysis.arquivos.map((item) => (
                  <article key={item.comparedFile} className="data-compare-ai-card">
                    <h4>{item.comparedFile}</h4>
                    <div className="data-compare-ai-metrics">
                      <span><strong>Ausentes:</strong> {item.missingCount}</span>
                      <span><strong>Valor ausente:</strong> R$ {formatBrl(item.missingValueTotal)}</span>
                    </div>
                    <p>{item.diagnosis || 'Sem diagnóstico para este arquivo.'}</p>
                    {!!item.topMissingKeys.length && (
                      <p className="muted">
                        <strong>Chaves críticas:</strong> {item.topMissingKeys.join(', ')}
                      </p>
                    )}
                    {!!item.recommendations.length && (
                      <ul>
                        {item.recommendations.map((action, index) => (
                          <li key={`${item.comparedFile}-rec-${index}`}>{action}</li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </div>
            )}

            {!!copilotAnalysis.alertas.length && (
              <>
                <strong>Alertas</strong>
                <ul>
                  {copilotAnalysis.alertas.map((alerta, index) => (
                    <li key={`alerta-${index}`}>{alerta}</li>
                  ))}
                </ul>
              </>
            )}

            {!!copilotAnalysis.planoAcao.length && (
              <>
                <strong>Plano de ação</strong>
                <ol>
                  {copilotAnalysis.planoAcao.map((step, index) => (
                    <li key={`plano-${index}`}>{step}</li>
                  ))}
                </ol>
              </>
            )}
          </div>
        )}
      </section>

      {isExecutePromptModalOpen && (
        <div
          className="data-compare-modal-overlay"
          role="presentation"
          onClick={handleCancelExecuteCopilotPrompt}
        >
          <section
            className="data-compare-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="data-compare-execute-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="data-compare-execute-modal-title">Executar prompt no GitHub Copilot?</h3>
            <p className="muted">
              O Copilot vai analisar as ausencias do arquivo base nos arquivos comparados e montar o diagnostico em tela.
            </p>
            <div className="results__actions">
              <button type="button" className="button-secondary" onClick={handleCancelExecuteCopilotPrompt}>
                Cancelar
              </button>
              <button type="button" className="button-primary" onClick={handleConfirmExecuteCopilotPrompt}>
                Executar
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
