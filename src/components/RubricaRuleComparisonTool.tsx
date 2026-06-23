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

type FieldDiff = {
  field: RubricaRuleFieldDefinition
  expected: string
  found: string
}

type Divergence = {
  rvCodfol: string
  diffs: FieldDiff[]
}

type ComparisonResult = {
  selectedRuleSetName: string
  totalRuleRows: number
  totalImportedRows: number
  equalRows: number
  divergences: Divergence[]
  missingInImported: string[]
  extraInImported: string[]
  duplicateCodesInImported: string[]
}

const EXCLUDED_FIELDS = new Set<RubricaRuleFieldKey>(['rv_desc', 'rv_descdet'])
const FIELD_CATALOG_MAP: Partial<Record<RubricaRuleFieldKey, string>> = {
  rv_origem: 'natureza-rubricas',
  rv_incirf: 'inc-irrf',
  rv_incfgts: 'inc-fgts',
  rv_inccp: 'inc-cp',
  rv_incop: 'inc-rpps',
  rv_incpis: 'inc-pis',
  rv_codfol: 'id-calculo-protheus',
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

async function parseWorkbookRows(file: File): Promise<Array<Record<RubricaRuleFieldKey, string>>> {
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

  for (const field of RUBRICA_RULE_FIELD_DEFINITIONS) {
    const columnIndex = headerRow.findIndex((header) => header === normalizeHeader(field.label))
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
      const parsed = {} as Record<RubricaRuleFieldKey, string>
      for (const field of RUBRICA_RULE_FIELD_DEFINITIONS) {
        const idx = columnIndexByKey.get(field.key)
        parsed[field.key] = idx === undefined ? '' : String(row[idx] ?? '').trim()
      }
      return parsed
    })
    .filter((row) => String(row.rv_codfol || '').trim())
}

function normalizeCode(value: string): string {
  return String(value || '').trim().toUpperCase()
}

function buildRowMap(rows: Array<Record<RubricaRuleFieldKey, string>>) {
  const map = new Map<string, Record<RubricaRuleFieldKey, string>>()
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

function compareRuleRows(ruleRows: RuleRow[], importedRows: Array<Record<RubricaRuleFieldKey, string>>, ruleSetName: string): ComparisonResult {
  const comparableFields = RUBRICA_RULE_FIELD_DEFINITIONS.filter(
    (field) => !EXCLUDED_FIELDS.has(field.key) && field.key !== 'rv_codfol',
  )

  const normalizedRuleRows = ruleRows.map((row) => {
    const normalized = {} as Record<RubricaRuleFieldKey, string>
    for (const field of RUBRICA_RULE_FIELD_DEFINITIONS) {
      normalized[field.key] = String(row[field.key] ?? '').trim()
    }
    return normalized
  })

  const { map: ruleMap } = buildRowMap(normalizedRuleRows)
  const { map: importedMap, duplicates } = buildRowMap(importedRows)

  const divergences: Divergence[] = []
  let equalRows = 0

  for (const [code, ruleRow] of ruleMap.entries()) {
    const imported = importedMap.get(code)
    if (!imported) continue

    const diffs: FieldDiff[] = []
    for (const field of comparableFields) {
      const expected = String(ruleRow[field.key] ?? '').trim()
      const found = String(imported[field.key] ?? '').trim()
      if (expected !== found) {
        diffs.push({
          field,
          expected,
          found,
        })
      }
    }

    if (diffs.length) {
      divergences.push({ rvCodfol: code, diffs })
    } else {
      equalRows += 1
    }
  }

  const missingInImported = Array.from(ruleMap.keys()).filter((code) => !importedMap.has(code)).sort((a, b) => a.localeCompare(b))
  const extraInImported = Array.from(importedMap.keys()).filter((code) => !ruleMap.has(code)).sort((a, b) => a.localeCompare(b))

  return {
    selectedRuleSetName: ruleSetName,
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
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ComparisonResult | null>(null)

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

  const handleCompare = async () => {
    if (!selectedRuleSetId) {
      setError('Selecione um cadastro de Tabela de Regra para comparar.')
      return
    }

    if (!selectedFile) {
      setError('Selecione uma planilha para comparacao.')
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

      const compared = compareRuleRows(ruleRows, rowsFromSheet, selectedRuleSet?.name || `Cadastro ${selectedRuleSetId}`)
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
              Relacione por RV_CODFOL e compare todos os campos, exceto RV_DESC e RV_DESCDET.
            </p>
          </div>
        </div>

        <div className="ch-table-toolbar" style={{ alignItems: 'flex-end' }}>
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
            <span>{selectedFile ? selectedFile.name : 'Selecionar planilha para comparar'}</span>
          </label>

          <button type="button" className="button-primary" onClick={handleCompare} disabled={isComparing || isLoadingSets}>
            {isComparing ? 'Comparando...' : 'Comparar'}
          </button>
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

          <div className="csv-table ch-table-theme" style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>RV_CODFOL</th>
                  <th>Campo</th>
                  <th>Valor na Tabela de Regra</th>
                  <th>Valor na Planilha</th>
                </tr>
              </thead>
              <tbody>
                {result.divergences.flatMap((item) =>
                  item.diffs.map((diff, index) => (
                    <tr key={`${item.rvCodfol}-${diff.field.key}-${index}`}>
                      <td>{item.rvCodfol}</td>
                      <td>{diff.field.label}</td>
                      <td>{formatFieldValue(diff.field.key, diff.expected)}</td>
                      <td>{formatFieldValue(diff.field.key, diff.found)}</td>
                    </tr>
                  )),
                )}
                {result.divergences.length === 0 && (
                  <tr>
                    <td colSpan={4} className="ch-empty">Nenhuma divergência encontrada nos campos comparáveis.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {(result.missingInImported.length > 0 || result.extraInImported.length > 0 || result.duplicateCodesInImported.length > 0) && (
            <div className="grid" style={{ marginTop: '1rem' }}>
              <section className="card" style={{ padding: '0.9rem 1rem' }}>
                <h4>Sem Correspondência na Planilha</h4>
                <p className="muted">RV_CODFOL existentes na Tabela de Regra e ausentes na planilha.</p>
                <p>{result.missingInImported.length ? result.missingInImported.map((item) => formatFieldValue('rv_codfol', item)).join(', ') : '-'}</p>
              </section>

              <section className="card" style={{ padding: '0.9rem 1rem' }}>
                <h4>Novos na Planilha</h4>
                <p className="muted">RV_CODFOL existentes na planilha e ausentes na Tabela de Regra.</p>
                <p>{result.extraInImported.length ? result.extraInImported.map((item) => formatFieldValue('rv_codfol', item)).join(', ') : '-'}</p>
              </section>

              <section className="card" style={{ padding: '0.9rem 1rem' }}>
                <h4>Duplicados na Planilha</h4>
                <p className="muted">RV_CODFOL repetidos no arquivo importado (a 1ª ocorrência foi considerada).</p>
                <p>{result.duplicateCodesInImported.length ? result.duplicateCodesInImported.map((item) => formatFieldValue('rv_codfol', item)).join(', ') : '-'}</p>
              </section>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
