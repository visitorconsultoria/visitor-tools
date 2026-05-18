import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { jsPDF } from 'jspdf'
import * as XLSX from 'xlsx'
import { apiUrl } from '../lib/api'

type ExpectedCondition = {
  column: string
  value: string
}

type RubricaRule = {
  id: number
  ruleName: string
  triggerColumn: string
  triggerValue: string
  expectedConditions: ExpectedCondition[]
  expectedColumn: string
  expectedValue: string
  isActive: boolean
  notes: string
}

type RubricaRuleForm = {
  ruleName: string
  triggerColumn: string
  triggerValue: string
  expectedConditions: ExpectedCondition[]
  isActive: boolean
  notes: string
}

type ParsedDataset = {
  fileName: string
  headers: string[]
  rows: string[][]
}

type ValidationDivergence = {
  ruleName: string
  rowNumber: number
  triggerColumn: string
  triggerValue: string
  expectedColumn: string
  expectedValue: string
  foundValue: string
  reason: string
}

const EMPTY_RULE_FORM: RubricaRuleForm = {
  ruleName: '',
  triggerColumn: '',
  triggerValue: '',
  expectedConditions: [{ column: '', value: '' }],
  isActive: true,
  notes: '',
}

function normalizeExpectedConditions(
  value: unknown,
  fallbackColumn = '',
  fallbackValue = '',
): ExpectedCondition[] {
  const source = Array.isArray(value)
    ? value
    : (fallbackColumn && fallbackValue ? [{ column: fallbackColumn, value: fallbackValue }] : [])

  const normalized = source
    .map((item) => {
      const record = item && typeof item === 'object' ? item : {}
      return {
        column: String((record as { column?: unknown }).column ?? '').trim(),
        value: String((record as { value?: unknown }).value ?? '').trim(),
      }
    })
    .filter((item) => item.column && item.value)

  return normalized.length ? normalized : [{ column: '', value: '' }]
}

function normalizeText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function normalizeForCompare(value: string): string {
  return normalizeText(value).replace(/\s+/g, ' ')
}

function normalizeHeaderKey(value: string): string {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '')
}

function detectCsvDelimiter(headerLine: string): string {
  const semicolonCount = (headerLine.match(/;/g) || []).length
  const commaCount = (headerLine.match(/,/g) || []).length
  return semicolonCount >= commaCount ? ';' : ','
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = []
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
      result.push(current)
      current = ''
      continue
    }

    current += char
  }

  result.push(current)
  return result.map((cell) => cell.trim())
}

function parseCsvText(fileName: string, text: string): ParsedDataset {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)

  if (!lines.length) return { fileName, headers: [], rows: [] }

  const delimiter = detectCsvDelimiter(lines[0])
  const matrix = lines.map((line) => splitCsvLine(line, delimiter))
  const [rawHeaders, ...rawRows] = matrix

  const headers = rawHeaders.map((header) => String(header || '').trim())
  const rows = rawRows.map((row) => headers.map((_, index) => String(row[index] ?? '').trim()))

  return { fileName, headers, rows }
}

function parseExcelFile(fileName: string, buffer: ArrayBuffer): ParsedDataset {
  const workbook = XLSX.read(buffer, { type: 'array' })
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!firstSheet) return { fileName, headers: [], rows: [] }

  const matrix = XLSX.utils.sheet_to_json<(string | number | null)[]>(firstSheet, {
    header: 1,
    raw: false,
    defval: '',
  })

  if (!matrix.length) return { fileName, headers: [], rows: [] }

  const [rawHeaders, ...rawRows] = matrix
  const headers = rawHeaders.map((header) => String(header ?? '').trim())
  const rows = rawRows.map((row) => headers.map((_, index) => String(row[index] ?? '').trim()))

  return { fileName, headers, rows }
}

function toFriendlyApiError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return 'Nao foi possivel conectar na API local. Inicie frontend + API com npm run dev:all.'
  }

  if (error instanceof Error) {
    return error.message || fallback
  }

  return fallback
}

function normalizeRuleResponse(input: unknown): RubricaRule {
  const row = input as Partial<RubricaRule>
  const expectedConditions = normalizeExpectedConditions(
    (row as { expectedConditions?: unknown }).expectedConditions,
    String(row.expectedColumn ?? ''),
    String(row.expectedValue ?? ''),
  )

  return {
    id: Number(row.id ?? 0),
    ruleName: String(row.ruleName ?? ''),
    triggerColumn: String(row.triggerColumn ?? ''),
    triggerValue: String(row.triggerValue ?? ''),
    expectedConditions,
    expectedColumn: expectedConditions[0]?.column || '',
    expectedValue: expectedConditions[0]?.value || '',
    isActive: row.isActive !== false,
    notes: String(row.notes ?? ''),
  }
}

function toSafePdfFilename(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'relatorio-rubricas'
}

export default function RubricasValidationTool() {
  const [rules, setRules] = useState<RubricaRule[]>([])
  const [isLoadingRules, setIsLoadingRules] = useState(false)
  const [isSavingRule, setIsSavingRule] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null)
  const [ruleForm, setRuleForm] = useState<RubricaRuleForm>(EMPTY_RULE_FORM)
  const modalRef = useRef<HTMLElement | null>(null)

  const [dataset, setDataset] = useState<ParsedDataset | null>(null)
  const [isParsingFile, setIsParsingFile] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [divergences, setDivergences] = useState<ValidationDivergence[]>([])

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const activeRules = useMemo(() => rules.filter((rule) => rule.isActive), [rules])

  useEffect(() => {
    const host = document.createElement('div')
    host.className = 'rubricas-modal-host'
    document.body.appendChild(host)
    modalRef.current = host

    return () => {
      host.remove()
      modalRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isModalOpen) return undefined

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isSavingRule) {
        setIsModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isModalOpen, isSavingRule])

  const fetchRules = async () => {
    setError(null)
    setIsLoadingRules(true)

    try {
      const response = await fetch(apiUrl('/api/rubrica-rules'))
      if (!response.ok) {
        let detail = 'Falha ao carregar regras de validacao.'
        try {
          const err = await response.json() as { error?: string }
          detail = String(err.error || detail)
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      const data = await response.json() as { items?: unknown[] }
      const items = Array.isArray(data.items) ? data.items.map(normalizeRuleResponse) : []
      setRules(items)
    } catch (loadError) {
      setError(toFriendlyApiError(loadError, 'Nao foi possivel carregar regras de validacao.'))
    } finally {
      setIsLoadingRules(false)
    }
  }

  useEffect(() => {
    void fetchRules()
  }, [])

  const resetRuleForm = () => {
    setRuleForm(EMPTY_RULE_FORM)
    setEditingRuleId(null)
  }

  const openCreateModal = () => {
    setError(null)
    setSuccess(null)
    resetRuleForm()
    setIsModalOpen(true)
  }

  const startEditRule = (rule: RubricaRule) => {
    setError(null)
    setSuccess(null)
    setEditingRuleId(rule.id)
    setRuleForm({
      ruleName: rule.ruleName,
      triggerColumn: rule.triggerColumn,
      triggerValue: rule.triggerValue,
      expectedConditions: normalizeExpectedConditions(
        rule.expectedConditions,
        rule.expectedColumn,
        rule.expectedValue,
      ),
      isActive: rule.isActive,
      notes: rule.notes,
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    if (isSavingRule) return
    setIsModalOpen(false)
    resetRuleForm()
  }

  const handleSaveRule = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const payload = {
      ruleName: ruleForm.ruleName,
      triggerColumn: ruleForm.triggerColumn,
      triggerValue: ruleForm.triggerValue,
      expectedConditions: ruleForm.expectedConditions
        .map((item) => ({
          column: item.column.trim(),
          value: item.value.trim(),
        }))
        .filter((item) => item.column && item.value),
      isActive: ruleForm.isActive,
      notes: ruleForm.notes,
    }

    if (!payload.expectedConditions.length) {
      setError('Informe ao menos um campo esperado para a regra.')
      return
    }

    setIsSavingRule(true)
    try {
      const endpoint = editingRuleId ? `/api/rubrica-rules/${editingRuleId}` : '/api/rubrica-rules'
      const method = editingRuleId ? 'PUT' : 'POST'

      const response = await fetch(apiUrl(endpoint), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let detail = editingRuleId
          ? 'Falha ao atualizar regra de validacao.'
          : 'Falha ao criar regra de validacao.'

        try {
          const err = await response.json() as { error?: string }
          detail = String(err.error || detail)
        } catch {
          detail = response.statusText || detail
        }

        throw new Error(detail)
      }

      setSuccess(editingRuleId ? 'Regra atualizada com sucesso.' : 'Regra criada com sucesso.')
      setIsModalOpen(false)
      resetRuleForm()
      await fetchRules()
    } catch (saveError) {
      setError(toFriendlyApiError(saveError, 'Nao foi possivel salvar regra.'))
    } finally {
      setIsSavingRule(false)
    }
  }

  const handleDeleteRule = async (id: number) => {
    setError(null)
    setSuccess(null)

    if (!window.confirm('Deseja remover esta regra de validacao?')) {
      return
    }

    try {
      const response = await fetch(apiUrl(`/api/rubrica-rules/${id}`), {
        method: 'DELETE',
      })

      if (!response.ok) {
        let detail = 'Falha ao excluir regra de validacao.'
        try {
          const err = await response.json() as { error?: string }
          detail = String(err.error || detail)
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      setSuccess('Regra excluida com sucesso.')
      await fetchRules()
    } catch (deleteError) {
      setError(toFriendlyApiError(deleteError, 'Nao foi possivel excluir regra.'))
    }
  }

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    setError(null)
    setSuccess(null)
    setDivergences([])

    if (!file) {
      setDataset(null)
      return
    }

    setIsParsingFile(true)
    try {
      const lowerName = file.name.toLowerCase()
      let parsed: ParsedDataset

      if (lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) {
        const buffer = await file.arrayBuffer()
        parsed = parseExcelFile(file.name, buffer)
      } else {
        const text = await file.text()
        parsed = parseCsvText(file.name, text)
      }

      if (!parsed.headers.length) {
        throw new Error('Arquivo sem cabecalho valido para validacao.')
      }

      setDataset(parsed)
      setSuccess(`Arquivo ${parsed.fileName} carregado com ${parsed.rows.length} linha(s) de dados.`)
    } catch (parseError) {
      setDataset(null)
      setError(toFriendlyApiError(parseError, 'Nao foi possivel processar o arquivo informado.'))
    } finally {
      setIsParsingFile(false)
      event.target.value = ''
    }
  }

  const runValidation = () => {
    setError(null)
    setSuccess(null)

    if (!dataset) {
      setError('Selecione um arquivo CSV ou Excel para validar.')
      return
    }

    if (!activeRules.length) {
      setError('Cadastre ao menos uma regra ativa para executar a validacao.')
      return
    }

    setIsValidating(true)
    try {
      const headerIndexByKey = new Map<string, number>()
      dataset.headers.forEach((header, index) => {
        headerIndexByKey.set(normalizeHeaderKey(header), index)
      })

      const nextDivergences: ValidationDivergence[] = []

      activeRules.forEach((rule) => {
        const triggerIndex = headerIndexByKey.get(normalizeHeaderKey(rule.triggerColumn))
        if (triggerIndex == null) {
          nextDivergences.push({
            ruleName: rule.ruleName,
            rowNumber: 0,
            triggerColumn: rule.triggerColumn,
            triggerValue: rule.triggerValue,
            expectedColumn: '-',
            expectedValue: '-',
            foundValue: '',
            reason: `Coluna gatilho nao encontrada no arquivo: ${rule.triggerColumn}`,
          })
          return
        }

        const triggerExpected = normalizeForCompare(rule.triggerValue)
        const expectedConditions = rule.expectedConditions.length
          ? rule.expectedConditions
          : [{ column: rule.expectedColumn, value: rule.expectedValue }]

        dataset.rows.forEach((row, rowIndex) => {
          const triggerCurrent = normalizeForCompare(String(row[triggerIndex] ?? ''))
          if (triggerCurrent !== triggerExpected) return

          expectedConditions.forEach((expected) => {
            const expectedIndex = headerIndexByKey.get(normalizeHeaderKey(expected.column))

            if (expectedIndex == null) {
              nextDivergences.push({
                ruleName: rule.ruleName,
                rowNumber: 0,
                triggerColumn: rule.triggerColumn,
                triggerValue: rule.triggerValue,
                expectedColumn: expected.column,
                expectedValue: expected.value,
                foundValue: '',
                reason: `Coluna esperada nao encontrada no arquivo: ${expected.column}`,
              })
              return
            }

            const foundRaw = String(row[expectedIndex] ?? '').trim()
            const foundCurrent = normalizeForCompare(foundRaw)
            const fieldExpected = normalizeForCompare(expected.value)
            if (foundCurrent === fieldExpected) return

            nextDivergences.push({
              ruleName: rule.ruleName,
              rowNumber: rowIndex + 2,
              triggerColumn: rule.triggerColumn,
              triggerValue: rule.triggerValue,
              expectedColumn: expected.column,
              expectedValue: expected.value,
              foundValue: foundRaw,
              reason: 'Valor divergente para a regra aplicada.',
            })
          })
        })
      })

      setDivergences(nextDivergences)

      if (!nextDivergences.length) {
        setSuccess('Validacao concluida sem divergencias.')
      } else {
        setSuccess(`Validacao concluida com ${nextDivergences.length} divergencia(s).`)
      }
    } finally {
      setIsValidating(false)
    }
  }

  const handlePrintReport = () => {
    if (!dataset) {
      setError('Selecione um arquivo e execute a validacao antes de imprimir.')
      return
    }

    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 44
    const contentWidth = pageWidth - margin * 2
    let y = margin

    const ensureSpace = (requiredHeight: number) => {
      if (y + requiredHeight <= pageHeight - margin) return
      doc.addPage()
      y = margin
    }

    const writeWrapped = (text: string, fontSize = 10) => {
      const lines = doc.splitTextToSize(text || '-', contentWidth)
      doc.setFontSize(fontSize)
      doc.text(lines, margin, y)
      y += lines.length * (fontSize + 3)
    }

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(14)
    doc.text('Relatorio de Validacao de Rubricas', margin, y)
    y += 20

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.text(`Arquivo: ${dataset.fileName}`, margin, y)
    y += 14
    doc.text(`Data/Hora: ${new Date().toLocaleString('pt-BR')}`, margin, y)
    y += 14
    doc.text(`Regras ativas: ${activeRules.length}`, margin, y)
    y += 14
    doc.text(`Divergencias encontradas: ${divergences.length}`, margin, y)
    y += 20

    if (!divergences.length) {
      doc.setFont('helvetica', 'bold')
      writeWrapped('Nenhuma divergencia encontrada para as regras aplicadas.', 11)
    } else {
      divergences.forEach((divergence, index) => {
        ensureSpace(126)

        doc.setDrawColor(218, 228, 224)
        doc.setFillColor(247, 251, 249)
        doc.roundedRect(margin, y - 12, contentWidth, 104, 6, 6, 'FD')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.text(`#${index + 1} - ${divergence.ruleName}`, margin + 8, y + 4)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        const lineOne = divergence.rowNumber > 0
          ? `Linha ${divergence.rowNumber}: quando ${divergence.triggerColumn} = ${divergence.triggerValue}`
          : `Regra com problema de cabecalho: ${divergence.triggerColumn} / ${divergence.expectedColumn}`

        const lineTwo = `Gatilho: ${divergence.triggerColumn} = ${divergence.triggerValue}`
        const lineThree = `Esperado em ${divergence.expectedColumn}: ${divergence.expectedValue}`
        const lineFour = `Encontrado: ${divergence.foundValue || '(vazio)'}`
        const lineFive = `Motivo: ${divergence.reason}`

        doc.text(doc.splitTextToSize(lineOne, contentWidth - 16), margin + 8, y + 20)
        doc.text(doc.splitTextToSize(lineTwo, contentWidth - 16), margin + 8, y + 35)
        doc.text(doc.splitTextToSize(lineThree, contentWidth - 16), margin + 8, y + 50)
        doc.text(doc.splitTextToSize(lineFour, contentWidth - 16), margin + 8, y + 65)
        doc.text(doc.splitTextToSize(lineFive, contentWidth - 16), margin + 8, y + 80)
        y += 110
      })
    }

    const fileName = toSafePdfFilename(`relatorio-rubricas-${dataset.fileName}`)
    doc.save(`${fileName}.pdf`)
  }

  return (
    <div className="estimativas-layout">
      <section className="card">
        <div className="estimativas-header-row">
          <div>
            <h2>Regras de Validacao</h2>
            <p className="muted">Gerencie o cadastro de regras para reutilizar em qualquer validacao.</p>
          </div>
          <button type="button" className="button-primary" onClick={openCreateModal}>
            Incluir regra
          </button>
        </div>

        <div className="estimativas-stats">
          <span>Total de regras: {rules.length}</span>
          <span>Ativas: {activeRules.length}</span>
          <span>Inativas: {Math.max(rules.length - activeRules.length, 0)}</span>
        </div>

        <div className="estimativas-actions" style={{ marginBottom: '0.75rem' }}>
          <button type="button" className="button-secondary" onClick={() => void fetchRules()} disabled={isLoadingRules}>
            {isLoadingRules ? 'Atualizando...' : 'Atualizar lista'}
          </button>
        </div>

        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}

        {!rules.length && !isLoadingRules ? (
          <p className="muted">Nenhuma regra cadastrada ate o momento.</p>
        ) : (
          <div className="estimativas-table ch-table-theme">
            <table>
              <thead>
                <tr>
                  <th>Regra</th>
                  <th>Condicao</th>
                  <th>Campos esperados</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id}>
                    <td>{rule.ruleName}</td>
                    <td>{rule.triggerColumn} = {rule.triggerValue}</td>
                    <td>{rule.expectedConditions.map((item) => `${item.column} = ${item.value}`).join(' | ')}</td>
                    <td>
                      <span className={`badge ${rule.isActive ? 'badge--success' : 'badge--pending'}`}>
                        {rule.isActive ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td>
                      <div className="estimativas-actions">
                        <button type="button" className="button-secondary" onClick={() => startEditRule(rule)}>
                          Editar
                        </button>
                        <button type="button" className="button-secondary" onClick={() => void handleDeleteRule(rule.id)}>
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="estimativas-header-row">
          <div>
            <h2>Validar Arquivo</h2>
            <p className="muted">Selecione um CSV/Excel para validar com as regras ativas.</p>
          </div>
        </div>

        <label className="file-input file-input--small">
          <input type="file" accept=".csv,.xlsx,.xls" onChange={(event) => void handleFileChange(event)} />
          <span>{isParsingFile ? 'Processando arquivo...' : 'Selecionar CSV ou Excel'}</span>
        </label>

        {dataset && (
          <div className="estimativas-stats" style={{ marginTop: '0.7rem' }}>
            <span>Arquivo: {dataset.fileName}</span>
            <span>Colunas: {dataset.headers.length}</span>
            <span>Linhas: {dataset.rows.length}</span>
            <span>Divergencias: {divergences.length}</span>
          </div>
        )}

        <datalist id="rubrica-headers-list">
          {(dataset?.headers || []).map((header) => (
            <option key={header} value={header} />
          ))}
        </datalist>

        <div className="estimativas-actions" style={{ marginTop: '0.45rem', marginBottom: '0.75rem' }}>
          <button
            type="button"
            className="button-primary"
            onClick={runValidation}
            disabled={isValidating || isParsingFile || !dataset}
          >
            {isValidating ? 'Validando...' : 'Executar validacao'}
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={handlePrintReport}
            disabled={!dataset}
          >
            Imprimir relatorio
          </button>
        </div>

        {!dataset ? (
          <p className="muted">Selecione um arquivo para iniciar a validacao.</p>
        ) : !divergences.length ? (
          <p className="muted">Nenhuma divergencia registrada nesta execucao.</p>
        ) : (
          <div className="estimativas-table ch-table-theme">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Regra</th>
                  <th>Linha</th>
                  <th>Gatilho</th>
                  <th>Esperado</th>
                  <th>Encontrado</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {divergences.map((item, index) => (
                  <tr key={`${item.ruleName}-${item.rowNumber}-${index}`}>
                    <td>{index + 1}</td>
                    <td>{item.ruleName}</td>
                    <td>{item.rowNumber > 0 ? item.rowNumber : '-'}</td>
                    <td>{item.triggerColumn} = {item.triggerValue}</td>
                    <td>{item.expectedColumn} = {item.expectedValue}</td>
                    <td>{item.foundValue || '(vazio)'}</td>
                    <td>{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {isModalOpen && modalRef.current && createPortal(
        <div className="estimativas-modal-overlay" role="presentation">
          <section className="estimativas-modal" role="dialog" aria-modal="true" aria-label="Cadastro de regra de validacao">
            <div className="estimativas-modal__header">
              <h3>{editingRuleId ? 'Editar regra de validacao' : 'Nova regra de validacao'}</h3>
              <button type="button" className="button-secondary" onClick={closeModal} disabled={isSavingRule}>Fechar</button>
            </div>

            <form className="estimativas-form" onSubmit={handleSaveRule}>
              <label>
                Nome da regra
                <input
                  value={ruleForm.ruleName}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, ruleName: event.target.value }))}
                  placeholder="Ex.: Id.p/Calculo 1285 exige INSS e FGTS"
                  required
                />
              </label>

              <label>
                Observacoes
                <input
                  value={ruleForm.notes}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Opcional"
                />
              </label>

              <label>
                Coluna gatilho
                <input
                  value={ruleForm.triggerColumn}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, triggerColumn: event.target.value }))}
                  list="rubrica-headers-list"
                  placeholder="Id.p/Calculo"
                  required
                />
              </label>

              <label>
                Valor gatilho
                <input
                  value={ruleForm.triggerValue}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, triggerValue: event.target.value }))}
                  placeholder="1285"
                  required
                />
              </label>

              <div className="estimativas-form__full" style={{ display: 'grid', gap: '0.55rem' }}>
                <div className="estimativas-header-row">
                  <strong>Campos esperados</strong>
                  <button
                    type="button"
                    className="button-secondary"
                    onClick={() => setRuleForm((prev) => ({
                      ...prev,
                      expectedConditions: [...prev.expectedConditions, { column: '', value: '' }],
                    }))}
                  >
                    Adicionar campo
                  </button>
                </div>

                {ruleForm.expectedConditions.map((condition, index) => (
                  <div
                    key={`expected-${index + 1}`}
                    style={{ display: 'grid', gap: '0.65rem', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto' }}
                  >
                    <input
                      value={condition.column}
                      onChange={(event) => {
                        const next = [...ruleForm.expectedConditions]
                        next[index] = { ...next[index], column: event.target.value }
                        setRuleForm((prev) => ({ ...prev, expectedConditions: next }))
                      }}
                      list="rubrica-headers-list"
                      placeholder="Coluna esperada"
                      required
                    />
                    <input
                      value={condition.value}
                      onChange={(event) => {
                        const next = [...ruleForm.expectedConditions]
                        next[index] = { ...next[index], value: event.target.value }
                        setRuleForm((prev) => ({ ...prev, expectedConditions: next }))
                      }}
                      placeholder="Valor esperado"
                      required
                    />
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => {
                        if (ruleForm.expectedConditions.length === 1) return
                        const next = ruleForm.expectedConditions.filter((_, itemIndex) => itemIndex !== index)
                        setRuleForm((prev) => ({ ...prev, expectedConditions: next }))
                      }}
                      disabled={ruleForm.expectedConditions.length === 1}
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>

              <label className="checkbox estimativas-form__full">
                <input
                  type="checkbox"
                  checked={ruleForm.isActive}
                  onChange={(event) => setRuleForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
                Regra ativa
              </label>

              <div className="estimativas-actions estimativas-form__full">
                <button type="submit" className="button-primary" disabled={isSavingRule}>
                  {isSavingRule ? 'Salvando...' : editingRuleId ? 'Atualizar regra' : 'Cadastrar regra'}
                </button>
                <button type="button" className="button-secondary" onClick={closeModal} disabled={isSavingRule}>
                  Cancelar
                </button>
              </div>
            </form>
          </section>
        </div>,
        modalRef.current,
      )}
    </div>
  )
}
