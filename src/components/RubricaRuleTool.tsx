import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
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
  sourceFileName: string
  createdAt: string
  updatedAt: string
}

type RuleFormValues = {
  [K in RubricaRuleFieldKey]: string
}

type RuleItem = {
  id: number
  ruleSetId: number
  sortOrder: number
  createdAt?: string
  updatedAt?: string
} & RuleFormValues

type RuleFormState = RuleFormValues & { id?: number; sortOrder?: number }
type RuleScreenMode = 'overview' | 'workspace'

function createEmptyRuleValues(): RuleFormValues {
  return Object.fromEntries(
    RUBRICA_RULE_FIELD_DEFINITIONS.map((field) => [field.key, '']),
  ) as RuleFormValues
}

function createEmptyRuleForm(): RuleFormState {
  return createEmptyRuleValues()
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

function toFriendlyApiError(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message || fallback
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

function normalizeRuleSetRow(row: unknown): RuleSet {
  const data = row && typeof row === 'object' ? row as Record<string, unknown> : {}
  return {
    id: Number(data.id ?? 0),
    name: String(data.name ?? ''),
    description: String(data.description ?? ''),
    sourceFileName: String(data.sourceFileName ?? data.source_file_name ?? ''),
    createdAt: String(data.createdAt ?? data.created_at ?? ''),
    updatedAt: String(data.updatedAt ?? data.updated_at ?? ''),
  }
}

function normalizeRuleItemRow(row: unknown): RuleItem {
  const data = row && typeof row === 'object' ? row as Record<string, unknown> : {}
  const base = createEmptyRuleValues()
  for (const field of RUBRICA_RULE_FIELD_DEFINITIONS) {
    base[field.key] = String(data[field.key] ?? '')
  }

  return {
    id: Number(data.id ?? 0),
    ruleSetId: Number(data.ruleSetId ?? data.rule_set_id ?? 0),
    sortOrder: Number(data.sortOrder ?? data.sort_order ?? 0),
    ...base,
  }
}

async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return await file.arrayBuffer()
}

async function parseWorkbookRows(file: File): Promise<RuleFormValues[]> {
  const buffer = await readFileAsArrayBuffer(file)
  const workbook = XLSX.read(buffer, { type: 'array' })
  const preferredSheet = workbook.SheetNames.find((name) => normalizeHeader(name) === 'tabela regra')
  const sheet = workbook.Sheets[preferredSheet || workbook.SheetNames[0]]
  if (!sheet) {
    throw new Error('A planilha nao possui aba de dados para importar.')
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
    const normalizedLabel = normalizeHeader(field.label)
    const columnIndex = headerRow.findIndex((header) => header === normalizedLabel)
    if (columnIndex === -1 && field.required) {
      throw new Error(`Coluna obrigatoria nao encontrada na planilha: ${field.label}`)
    }
    if (columnIndex >= 0) {
      columnIndexByKey.set(field.key, columnIndex)
    }
  }

  return matrix
    .slice(1)
    .map((row) => {
      const next = createEmptyRuleForm()
      for (const field of RUBRICA_RULE_FIELD_DEFINITIONS) {
        const columnIndex = columnIndexByKey.get(field.key)
        next[field.key] = columnIndex === undefined ? '' : String(row[columnIndex] ?? '').trim()
      }
      return next
    })
    .filter((row) => RUBRICA_RULE_FIELD_DEFINITIONS.some((field) => row[field.key].trim()))
}

export default function RubricaRuleTool() {
  const [ruleSets, setRuleSets] = useState<RuleSet[]>([])
  const [selectedRuleSetId, setSelectedRuleSetId] = useState<number | null>(null)
  const [currentScreen, setCurrentScreen] = useState<RuleScreenMode>('overview')
  const [items, setItems] = useState<RuleItem[]>([])
  const [search, setSearch] = useState('')
  const [columnFilters, setColumnFilters] = useState<RuleFormValues>(createEmptyRuleValues())
  const [importName, setImportName] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [isLoadingSets, setIsLoadingSets] = useState(false)
  const [isLoadingItems, setIsLoadingItems] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<RuleFormState>(createEmptyRuleForm())
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const selectedRuleSet = useMemo(
    () => ruleSets.find((item) => item.id === selectedRuleSetId) ?? null,
    [ruleSets, selectedRuleSetId],
  )

  const activeColumnFilters = useMemo(
    () => RUBRICA_RULE_FIELD_DEFINITIONS.filter((field) => columnFilters[field.key].trim()).length,
    [columnFilters],
  )

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items.filter((item) => {
      const matchesSearch = !term || RUBRICA_RULE_FIELD_DEFINITIONS.some((field) => item[field.key].toLowerCase().includes(term))
      if (!matchesSearch) return false

      return RUBRICA_RULE_FIELD_DEFINITIONS.every((field) => {
        const filterValue = columnFilters[field.key].trim().toLowerCase()
        if (!filterValue) return true
        return item[field.key].toLowerCase().includes(filterValue)
      })
    })
  }, [columnFilters, items, search])

  const fetchRuleSets = async (preferredRuleSetId?: number | null) => {
    setIsLoadingSets(true)
    try {
      const response = await fetch(apiUrl('/api/rubricas/regras/sets'))
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Falha ao carregar os cadastros da tabela de regra.')
      }

      const body = await response.json() as { items?: unknown[] }
      const nextSets = Array.isArray(body.items) ? body.items.map(normalizeRuleSetRow) : []
      setRuleSets(nextSets)

      const nextSelectedId = preferredRuleSetId
        && nextSets.some((item) => item.id === preferredRuleSetId)
        ? preferredRuleSetId
        : nextSets[0]?.id ?? null

      setSelectedRuleSetId(nextSelectedId)
      if (!nextSelectedId) {
        setItems([])
      }
    } catch (err) {
      setError(toFriendlyApiError(err, 'Nao foi possivel carregar os cadastros da tabela de regra.'))
    } finally {
      setIsLoadingSets(false)
    }
  }

  const fetchRuleItems = async (ruleSetId: number) => {
    setIsLoadingItems(true)
    try {
      const response = await fetch(apiUrl(`/api/rubricas/regras/sets/${ruleSetId}/items`))
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || 'Falha ao carregar os registros da tabela de regra.')
      }

      const body = await response.json() as { items?: unknown[] }
      const nextItems = Array.isArray(body.items) ? body.items.map(normalizeRuleItemRow) : []
      setItems(nextItems)
    } catch (err) {
      setItems([])
      setError(toFriendlyApiError(err, 'Nao foi possivel carregar os registros da tabela de regra.'))
    } finally {
      setIsLoadingItems(false)
    }
  }

  useEffect(() => {
    void fetchRuleSets()
  }, [])

  useEffect(() => {
    if (!selectedRuleSetId) {
      setItems([])
      return
    }
    void fetchRuleItems(selectedRuleSetId)
  }, [selectedRuleSetId])

  const openCreateModal = () => {
    if (!selectedRuleSetId) {
      setError('Crie ou selecione um cadastro antes de adicionar regras.')
      return
    }
    setError(null)
    setSuccess(null)
    setForm(createEmptyRuleForm())
    setModalOpen(true)
  }

  const openEditModal = (item: RuleItem) => {
    setError(null)
    setSuccess(null)
    setForm({
      id: item.id,
      sortOrder: item.sortOrder,
      ...Object.fromEntries(
        RUBRICA_RULE_FIELD_DEFINITIONS.map((field) => [field.key, item[field.key]]),
      ) as RuleFormValues,
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setForm(createEmptyRuleForm())
  }

  const setFormField = (field: RubricaRuleFieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const setColumnFilterField = (field: RubricaRuleFieldKey, value: string) => {
    setColumnFilters((prev) => ({ ...prev, [field]: value }))
  }

  const clearFilters = () => {
    setSearch('')
    setColumnFilters(createEmptyRuleValues())
  }

  const openWorkspace = (ruleSetId?: number | null) => {
    if (typeof ruleSetId === 'number') {
      setSelectedRuleSetId(ruleSetId)
    }
    setCurrentScreen('workspace')
  }

  const goToOverview = () => {
    setCurrentScreen('overview')
  }

  const handleExportSelectedRuleSet = () => {
    if (!selectedRuleSet || !items.length) {
      setError('Selecione um cadastro com regras para exportar.')
      return
    }

    setError(null)
    setSuccess(null)

    const workbook = XLSX.utils.book_new()
    const metaRows = [
      ['Cadastro', selectedRuleSet.name],
      ['Origem', selectedRuleSet.sourceFileName || '-'],
      ['Descricao', selectedRuleSet.description || '-'],
      ['Exportado em', new Date().toLocaleString('pt-BR')],
      ['Total de regras', String(items.length)],
    ]

    const detailRows = items.map((item) => Object.fromEntries(
      RUBRICA_RULE_FIELD_DEFINITIONS.map((field) => [field.label, item[field.key]]),
    ))

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(metaRows), 'Resumo')
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), 'Regras')

    const safeName = selectedRuleSet.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9-_]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'tabela-regra'

    XLSX.writeFile(workbook, `tabela-regra-${safeName}.xlsx`)
    setSuccess(`Cadastro "${selectedRuleSet.name}" exportado com sucesso.`)
  }

  const handleCreateRuleSet = async () => {
    const name = window.prompt('Informe o nome do novo cadastro da Tabela de Regra:')?.trim() || ''
    if (!name) return

    setError(null)
    setSuccess(null)
    setIsSaving(true)
    try {
      const response = await fetch(apiUrl('/api/rubricas/regras/sets'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })

      const bodyText = await response.text()
      const body = bodyText ? JSON.parse(bodyText) as { error?: string; item?: { id?: number } } : null
      if (!response.ok) {
        throw new Error(body?.error ?? 'Falha ao criar o cadastro da tabela de regra.')
      }

      const nextId = body?.item?.id ? Number(body.item.id) : null
      await fetchRuleSets(nextId)
      openWorkspace(nextId)
      setSuccess('Cadastro criado com sucesso.')
    } catch (err) {
      setError(toFriendlyApiError(err, 'Nao foi possivel criar o cadastro.'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleRenameRuleSet = async () => {
    if (!selectedRuleSet) return
    const name = window.prompt('Informe o novo nome do cadastro:', selectedRuleSet.name)?.trim() || ''
    if (!name || name === selectedRuleSet.name) return

    setError(null)
    setSuccess(null)
    setIsSaving(true)
    try {
      const response = await fetch(apiUrl(`/api/rubricas/regras/sets/${selectedRuleSet.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })

      const bodyText = await response.text()
      const body = bodyText ? JSON.parse(bodyText) as { error?: string } : null
      if (!response.ok) {
        throw new Error(body?.error ?? 'Falha ao renomear o cadastro.')
      }

      await fetchRuleSets(selectedRuleSet.id)
      setSuccess('Cadastro atualizado com sucesso.')
    } catch (err) {
      setError(toFriendlyApiError(err, 'Nao foi possivel atualizar o cadastro.'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleReplicateRuleSet = async (targetRuleSet: RuleSet | null = selectedRuleSet) => {
    if (!targetRuleSet) return
    const name = window.prompt('Informe o nome do cadastro replicado:', `${targetRuleSet.name} - Copia`)?.trim() || ''
    if (!name) return

    setError(null)
    setSuccess(null)
    setIsSaving(true)
    try {
      const response = await fetch(apiUrl(`/api/rubricas/regras/sets/${targetRuleSet.id}/replicate`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })

      const bodyText = await response.text()
      const body = bodyText ? JSON.parse(bodyText) as { error?: string; item?: { id?: number } } : null
      if (!response.ok) {
        throw new Error(body?.error ?? 'Falha ao replicar o cadastro.')
      }

      const nextId = body?.item?.id ? Number(body.item.id) : null
      await fetchRuleSets(nextId)
      openWorkspace(nextId)
      setSuccess('Cadastro replicado com sucesso.')
    } catch (err) {
      setError(toFriendlyApiError(err, 'Nao foi possivel replicar o cadastro.'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteRuleSet = async (targetRuleSet: RuleSet | null = selectedRuleSet) => {
    if (!targetRuleSet) return
    if (!window.confirm(`Excluir o cadastro "${targetRuleSet.name}" e todas as suas regras?`)) return

    setError(null)
    setSuccess(null)
    setIsSaving(true)
    try {
      const response = await fetch(apiUrl(`/api/rubricas/regras/sets/${targetRuleSet.id}`), {
        method: 'DELETE',
      })

      const bodyText = await response.text()
      const body = bodyText ? JSON.parse(bodyText) as { error?: string } : null
      if (!response.ok) {
        throw new Error(body?.error ?? 'Falha ao excluir o cadastro.')
      }

      await fetchRuleSets()
      setSuccess('Cadastro excluido com sucesso.')
    } catch (err) {
      setError(toFriendlyApiError(err, 'Nao foi possivel excluir o cadastro.'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleImport = async () => {
    const name = importName.trim()
    if (!name) {
      setError('Informe o nome do cadastro para importar a planilha.')
      return
    }

    if (!importFile) {
      setError('Selecione a planilha modelo para importar.')
      return
    }

    setError(null)
    setSuccess(null)
    setIsImporting(true)
    try {
      const rows = await parseWorkbookRows(importFile)
      if (!rows.length) {
        throw new Error('A planilha nao possui registros validos para importar.')
      }

      const response = await fetch(apiUrl('/api/rubricas/regras/import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          sourceFileName: importFile.name,
          rows,
        }),
      })

      const bodyText = await response.text()
      const body = bodyText ? JSON.parse(bodyText) as { error?: string; item?: { id?: number; name?: string } } : null
      if (!response.ok) {
        throw new Error(body?.error ?? 'Falha ao importar a planilha modelo.')
      }

      const nextId = body?.item?.id ? Number(body.item.id) : null
      const createdName = String(body?.item?.name ?? name).trim() || name
      await fetchRuleSets(nextId)
      openWorkspace(nextId)
      setImportName('')
      setImportFile(null)
      setSuccess(`Planilha importada com sucesso para o cadastro "${createdName}".`)
    } catch (err) {
      setError(toFriendlyApiError(err, 'Nao foi possivel importar a planilha.'))
    } finally {
      setIsImporting(false)
    }
  }

  const handleSaveItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedRuleSetId) {
      setError('Selecione um cadastro antes de salvar uma regra.')
      return
    }

    setError(null)
    setSuccess(null)
    setIsSaving(true)

    try {
      const payload = Object.fromEntries(
        RUBRICA_RULE_FIELD_DEFINITIONS.map((field) => [field.key, form[field.key].trim()]),
      ) as RuleFormValues

      const isEdit = Boolean(form.id)
      const url = isEdit
        ? apiUrl(`/api/rubricas/regras/sets/${selectedRuleSetId}/items/${form.id}`)
        : apiUrl(`/api/rubricas/regras/sets/${selectedRuleSetId}/items`)

      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          sortOrder: form.sortOrder ?? items.length + 1,
        }),
      })

      const bodyText = await response.text()
      const body = bodyText ? JSON.parse(bodyText) as { error?: string } : null
      if (!response.ok) {
        throw new Error(body?.error ?? 'Falha ao salvar a regra.')
      }

      closeModal()
      await fetchRuleItems(selectedRuleSetId)
      setSuccess(isEdit ? 'Regra atualizada com sucesso.' : 'Regra criada com sucesso.')
    } catch (err) {
      setError(toFriendlyApiError(err, 'Nao foi possivel salvar a regra.'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteItem = async (itemId: number) => {
    if (!selectedRuleSetId) return
    if (!window.confirm('Excluir esta regra?')) return

    setError(null)
    setSuccess(null)
    try {
      const response = await fetch(apiUrl(`/api/rubricas/regras/sets/${selectedRuleSetId}/items/${itemId}`), {
        method: 'DELETE',
      })

      const bodyText = await response.text()
      const body = bodyText ? JSON.parse(bodyText) as { error?: string } : null
      if (!response.ok) {
        throw new Error(body?.error ?? 'Falha ao excluir a regra.')
      }

      await fetchRuleItems(selectedRuleSetId)
      setSuccess('Regra excluida com sucesso.')
    } catch (err) {
      setError(toFriendlyApiError(err, 'Nao foi possivel excluir a regra.'))
    }
  }

  return (
    <div className={`customer-hub rule-tool ${currentScreen === 'workspace' ? 'rule-tool--workspace' : 'rule-tool--overview'}`}>
      {modalOpen && createPortal(
        <div className="estimativas-modal-overlay" role="presentation" onClick={closeModal}>
          <section className="estimativas-modal rule-tool__modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="estimativas-modal__header">
              <h3>{form.id ? 'Editar Regra' : 'Nova Regra'}</h3>
              <button type="button" className="button-secondary" onClick={closeModal}>Fechar</button>
            </div>

            <form className="estimativas-form rule-tool__form" onSubmit={(event) => { void handleSaveItem(event) }}>
              {(RUBRICA_RULE_FIELD_DEFINITIONS as readonly RubricaRuleFieldDefinition[]).map((field) => (
                <label key={field.key} className={field.multiline ? 'estimativas-form__full' : undefined}>
                  {field.label}{field.required ? ' *' : ''}
                  {field.multiline ? (
                    <textarea
                      rows={field.key === 'rv_descdet' ? 4 : 3}
                      value={form[field.key]}
                      onChange={(event) => setFormField(field.key, event.target.value)}
                    />
                  ) : (
                    <input
                      value={form[field.key]}
                      onChange={(event) => setFormField(field.key, event.target.value)}
                    />
                  )}
                </label>
              ))}

              <div className="estimativas-actions estimativas-form__full">
                <button type="submit" className="button-primary" disabled={isSaving}>
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </section>
        </div>,
        document.body,
      )}

      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}

      {currentScreen === 'overview' ? (
        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>Cadastros de Regras</h2>
              <p className="muted">Tela inicial com todas as regras cadastradas. Escolha um cadastro para abrir ou avance para a segunda tela para incluir e importar novas regras.</p>
            </div>
            <div className="ch-header-actions">
              <button type="button" className="button-primary" onClick={() => openWorkspace(selectedRuleSetId)}>
                Incluir / Importar Regras
              </button>
            </div>
          </div>

          {isLoadingSets ? (
            <p className="muted">Carregando cadastros...</p>
          ) : ruleSets.length === 0 ? (
            <div className="rule-tool__empty-state">
              <h3>Nenhum cadastro criado</h3>
              <p className="muted">Use a segunda tela para criar um novo cadastro manualmente ou importar uma planilha modelo.</p>
              <button type="button" className="button-primary" onClick={() => openWorkspace(null)}>
                Ir para Inclusão / Importação
              </button>
            </div>
          ) : (
            <div className="rule-tool__set-grid">
              {ruleSets.map((ruleSet) => (
                <article key={ruleSet.id} className={`rule-tool__set-card ${selectedRuleSetId === ruleSet.id ? 'rule-tool__set-card--active' : ''}`}>
                  <div>
                    <h3>{ruleSet.name}</h3>
                    <p className="muted">{ruleSet.sourceFileName ? `Origem: ${ruleSet.sourceFileName}` : 'Cadastro criado manualmente.'}</p>
                    <p className="muted">Atualizado em: {ruleSet.updatedAt ? new Date(ruleSet.updatedAt).toLocaleString('pt-BR') : '-'}</p>
                  </div>
                  <div className="ch-header-actions">
                    <button type="button" className="button-primary" onClick={() => openWorkspace(ruleSet.id)}>
                      Abrir
                    </button>
                    <button type="button" className="button-secondary" onClick={() => {
                      setSelectedRuleSetId(ruleSet.id)
                      void handleReplicateRuleSet(ruleSet)
                    }} disabled={isSaving || isImporting}>
                      Replicar
                    </button>
                    <button type="button" className="button-secondary" onClick={() => {
                      setSelectedRuleSetId(ruleSet.id)
                      void handleDeleteRuleSet(ruleSet)
                    }} disabled={isSaving || isImporting}>
                      Excluir
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        <div className="rule-tool__workspace">
          <section className="card">
            <div className="ch-section-header">
              <div>
                <h2>Inclusão e Importação de Regras</h2>
                <p className="muted">Segunda tela para criar cadastros, importar planilhas modelo e administrar a base selecionada.</p>
              </div>
              <div className="ch-header-actions rule-tool__header-actions">
                <button type="button" className="button-secondary" onClick={goToOverview}>
                  Voltar para a Tela Inicial
                </button>
                <button type="button" className="button-primary" onClick={handleCreateRuleSet} disabled={isSaving || isImporting}>
                  + Novo Cadastro
                </button>
                <button type="button" className="button-secondary" onClick={handleRenameRuleSet} disabled={!selectedRuleSet || isSaving || isImporting}>
                  Renomear
                </button>
                <button type="button" className="button-secondary" onClick={() => { void handleReplicateRuleSet() }} disabled={!selectedRuleSet || isSaving || isImporting}>
                  Replicar
                </button>
                <button type="button" className="button-secondary" onClick={() => { void handleDeleteRuleSet() }} disabled={!selectedRuleSet || isSaving || isImporting}>
                  Excluir Cadastro
                </button>
              </div>
            </div>

            <div className="rule-tool__controls">
              <label>
                Cadastro ativo
                <select
                  value={selectedRuleSetId ?? ''}
                  onChange={(event) => setSelectedRuleSetId(event.target.value ? Number(event.target.value) : null)}
                  disabled={isLoadingSets || ruleSets.length === 0}
                >
                  {ruleSets.length === 0 ? (
                    <option value="">Nenhum cadastro criado</option>
                  ) : (
                    ruleSets.map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))
                  )}
                </select>
              </label>
              <label>
                Nome para importacao
                <input
                  value={importName}
                  onChange={(event) => setImportName(event.target.value)}
                  placeholder="Ex.: Regras folha matriz"
                  disabled={isImporting}
                />
              </label>
              <label className="rule-tool__file-input">
                Planilha modelo
                <input
                  type="file"
                  accept=".xlsx,.xls,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                  disabled={isImporting}
                />
              </label>
              <div className="rule-tool__import-action">
                <button type="button" className="button-primary" onClick={handleImport} disabled={isImporting}>
                  {isImporting ? 'Importando...' : 'Importar Planilha Modelo'}
                </button>
                {importFile && <span className="muted">Arquivo: {importFile.name}</span>}
              </div>
            </div>

            {selectedRuleSet && (
              <p className="muted rule-tool__meta">
                Cadastro selecionado: <strong>{selectedRuleSet.name}</strong>
                {selectedRuleSet.sourceFileName ? ` • Origem: ${selectedRuleSet.sourceFileName}` : ''}
                {selectedRuleSet.description ? ` • ${selectedRuleSet.description}` : ''}
              </p>
            )}
          </section>

          <section className="card rule-tool__rules-card">
            <div className="ch-section-header">
              <div>
                <h2>Regras do Cadastro</h2>
                <p className="muted">CRUD completo das regras importadas ou digitadas manualmente.</p>
              </div>
              <div className="ch-header-actions">
                <button type="button" className="button-secondary" onClick={handleExportSelectedRuleSet} disabled={!selectedRuleSetId || isLoadingItems || items.length === 0}>
                  Exportar Excel
                </button>
                <button type="button" className="button-primary" onClick={openCreateModal} disabled={!selectedRuleSetId || isLoadingItems}>
                  + Nova Regra
                </button>
              </div>
            </div>

            <div className="ch-table-toolbar ch-table-toolbar--single rule-tool__sticky-toolbar">
              <div className="rule-tool__toolbar">
                <label className="ch-table-search">
                  <span className="ch-table-search__icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
                  </span>
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar em qualquer coluna da regra..."
                    aria-label="Buscar regra"
                  />
                </label>
                <div className="rule-tool__toolbar-actions">
                  <span className="muted">
                    {filteredItems.length} de {items.length} regra(s)
                    {activeColumnFilters > 0 ? ` • ${activeColumnFilters} filtro(s) por coluna` : ''}
                  </span>
                  <button type="button" className="button-secondary" onClick={clearFilters} disabled={!search && activeColumnFilters === 0}>
                    Limpar Filtros
                  </button>
                </div>
              </div>
            </div>

            <div className="csv-table ch-table-theme rule-tool__table-wrap">
              <table>
                <thead>
                  <tr>
                    {(RUBRICA_RULE_FIELD_DEFINITIONS as readonly RubricaRuleFieldDefinition[]).map((field, index) => (
                      <th key={field.key} className={`rule-tool__sticky-head ${index === 0 ? 'rule-tool__sticky-col' : ''}`}>
                        <div className="rule-tool__th-label">{field.label}</div>
                        <input
                          className="rule-tool__column-filter"
                          type="search"
                          value={columnFilters[field.key]}
                          onChange={(event) => setColumnFilterField(field.key, event.target.value)}
                          placeholder="Filtrar"
                          aria-label={`Filtrar coluna ${field.label}`}
                        />
                      </th>
                    ))}
                    <th className="rule-tool__sticky-head rule-tool__sticky-col-right">
                      <div className="rule-tool__th-label">Acoes</div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id}>
                      {(RUBRICA_RULE_FIELD_DEFINITIONS as readonly RubricaRuleFieldDefinition[]).map((field, index) => (
                        <td key={field.key} className={index === 0 ? 'rule-tool__sticky-col rule-tool__sticky-col-cell' : undefined}>{item[field.key] || '-'}</td>
                      ))}
                      <td className="rule-tool__sticky-col-right rule-tool__sticky-col-right-cell">
                        <div className="ch-row-actions ch-row-actions--icons">
                          <button type="button" className="ch-icon-action" aria-label="Editar regra" title="Editar" onClick={() => openEditModal(item)}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir regra" title="Excluir" onClick={() => void handleDeleteItem(item.id)}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredItems.length === 0 && (
                    <tr>
                      <td colSpan={RUBRICA_RULE_FIELD_DEFINITIONS.length + 1} className="ch-empty">
                        {isLoadingItems ? 'Carregando regras...' : 'Nenhuma regra encontrada para o cadastro selecionado.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
