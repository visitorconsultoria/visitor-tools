import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { apiUrl } from '../lib/api'

type DailyActivityRow = {
  id: number
  date: string
  resource: string
  activity: string
  hours: string
  notes: string
}

type DailyActivityForm = {
  date: string
  resource: string
  activity: string
  hours: string
  notes: string
}

type DailyActivityToolProps = {
  currentUsername: string
  currentDisplayName?: string
}

type UserResourceOption = {
  username: string
  displayName: string
  isActive: boolean
}

const EMPTY_FORM: DailyActivityForm = {
  date: '',
  resource: '',
  activity: '',
  hours: '',
  notes: '',
}

function getCurrentMonthKey(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function normalizeDateInput(value: string): string {
  if (!value) return ''
  const trimmed = value.trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`

  return trimmed
}

function toDisplayDate(value: string): string {
  const iso = normalizeDateInput(value)
  if (!iso) return value
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

function parseHoursValue(value: string): number {
  const normalized = String(value ?? '').replace(',', '.').trim()
  const numeric = Number(normalized)
  return Number.isFinite(numeric) ? numeric : 0
}

function formatHoursValue(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })
}

function toMonthLabel(value: string): string {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return 'Periodo nao informado'
  return `${value.slice(5, 7)}/${value.slice(0, 4)}`
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

function normalizeActivityResponse(input: unknown): DailyActivityRow {
  const row = input as Partial<DailyActivityRow>

  return {
    id: Number(row.id ?? 0),
    date: String(row.date ?? ''),
    resource: String(row.resource ?? ''),
    activity: String(row.activity ?? ''),
    hours: String(row.hours ?? ''),
    notes: String(row.notes ?? ''),
  }
}

export default function DailyActivityTool({ currentUsername, currentDisplayName = '' }: DailyActivityToolProps) {
  const [items, setItems] = useState<DailyActivityRow[]>([])
  const [search, setSearch] = useState('')
  const [monthFilter, setMonthFilter] = useState(getCurrentMonthKey)
  const [isLoadingRecords, setIsLoadingRecords] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<DailyActivityForm>(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [resourceOptions, setResourceOptions] = useState<string[]>([])

  const normalizedUsername = currentUsername.trim().toLowerCase()
  const loggedResourceName = currentDisplayName.trim() || currentUsername.trim()
  const isVisitorUser = normalizedUsername === 'visitor'
  const userHeaders = {
    'x-user': currentUsername.trim(),
    'x-user-display': currentDisplayName.trim(),
  }

  const adminHeaders = {
    'x-admin-user': currentUsername.trim().toLowerCase(),
  }

  const fetchResourceOptions = async () => {
    if (!isVisitorUser) return

    try {
      const response = await fetch(apiUrl('/api/users'), {
        headers: adminHeaders,
      })

      if (!response.ok) {
        return
      }

      const data = await response.json() as { items?: unknown[] }
      const users = Array.isArray(data.items) ? data.items : []

      const options = users
        .map((input) => {
          const user = input as Partial<UserResourceOption>
          const username = String(user.username ?? '').trim()
          const displayName = String(user.displayName ?? '').trim()
          const isActive = Boolean(user.isActive)
          return {
            username,
            displayName,
            isActive,
          }
        })
        .filter((user) => user.isActive)
        .map((user) => user.displayName || user.username)
        .filter(Boolean)

      setResourceOptions(Array.from(new Set(options)).sort((a, b) => a.localeCompare(b, 'pt-BR')))
    } catch {
      // Keep form usable even if users endpoint fails.
      setResourceOptions([])
    }
  }

  const fetchActivities = async () => {
    setError(null)
    setIsLoadingRecords(true)

    try {
      const response = await fetch(apiUrl('/api/daily-activities'), {
        headers: userHeaders,
      })
      if (!response.ok) {
        let detail = 'Falha ao carregar apontamentos.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      const data = await response.json() as { items?: unknown[] }
      const nextItems = Array.isArray(data.items) ? data.items.map(normalizeActivityResponse) : []
      setItems(nextItems)
    } catch (loadError) {
      setError(toFriendlyApiError(loadError, 'Nao foi possivel carregar apontamentos.'))
    } finally {
      setIsLoadingRecords(false)
    }
  }

  useEffect(() => {
    void fetchActivities()
  }, [])

  useEffect(() => {
    if (!isVisitorUser) return
    void fetchResourceOptions()
  }, [isVisitorUser])

  const monthItems = useMemo(() => {
    if (!monthFilter) return items
    return items.filter((item) => normalizeDateInput(item.date).startsWith(`${monthFilter}-`))
  }, [items, monthFilter])

  const totalHours = useMemo(
    () => monthItems.reduce((sum, item) => sum + parseHoursValue(item.hours), 0),
    [monthItems],
  )

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()

    return monthItems
      .filter((item) => {
        if (!term) return true
        return [item.id, item.date, item.resource, item.activity, item.hours, item.notes]
          .join(' ')
          .toLowerCase()
          .includes(term)
      })
      .sort((a, b) => b.id - a.id)
  }, [monthItems, search])

  const handleExportMonthExcel = async () => {
    setError(null)
    setSuccess(null)

    if (!monthItems.length) {
      setError('Nao ha apontamentos no mes selecionado para exportar.')
      return
    }

    const totalsByResource = new Map<string, number>()
    monthItems.forEach((item) => {
      const key = item.resource.trim() || 'Sem recurso'
      const current = totalsByResource.get(key) || 0
      totalsByResource.set(key, current + parseHoursValue(item.hours))
    })

    const summaryRows = Array.from(totalsByResource.entries())
      .sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'))

    const grandTotal = summaryRows.reduce((acc, [, total]) => acc + total, 0)

    const detailRows = monthItems
      .slice()
      .sort((a, b) => {
        const dateCompare = normalizeDateInput(a.date).localeCompare(normalizeDateInput(b.date))
        if (dateCompare !== 0) return dateCompare
        return a.resource.localeCompare(b.resource, 'pt-BR')
      })
      .map((item) => ({
        Codigo: item.id,
        Data: toDisplayDate(item.date),
        Recurso: item.resource,
        Atividade: item.activity,
        Horas: parseHoursValue(item.hours),
        Observacoes: item.notes,
      }))

    try {
      const { utils, writeFileXLSX } = await import('xlsx')
      const workbook = utils.book_new()

      const summarySheet = utils.aoa_to_sheet([
        ['Relatorio de apontamentos mensais'],
        ['Mes', toMonthLabel(monthFilter)],
        [],
        ['Recurso', 'Total de horas'],
        ...summaryRows.map(([resource, total]) => [resource, Number(total.toFixed(2))]),
        ['TOTAL GERAL', Number(grandTotal.toFixed(2))],
        [],
        ['Detalhamento dos apontamentos do mes'],
        ['Data', 'Recurso', 'Atividade', 'Horas'],
        ...detailRows.map((item) => [item.Data, item.Recurso, item.Atividade, item.Horas]),
      ])

      const detailsSheet = utils.json_to_sheet(detailRows)

      utils.book_append_sheet(workbook, summarySheet, 'Resumo')
      utils.book_append_sheet(workbook, detailsSheet, 'Apontamentos')

      const safeMonth = monthFilter || 'periodo'
      writeFileXLSX(workbook, `apontamentos-${safeMonth}.xlsx`)
      setSuccess('Planilha exportada com sucesso.')
    } catch (exportError) {
      setError(toFriendlyApiError(exportError, 'Nao foi possivel exportar a planilha.'))
    }
  }

  const openModal = () => {
    setError(null)
    setSuccess(null)
    setEditingId(null)
    setForm({
      ...EMPTY_FORM,
      resource: isVisitorUser ? '' : loggedResourceName,
    })
    setIsModalOpen(true)
  }

  const openEditModal = (item: DailyActivityRow) => {
    setError(null)
    setSuccess(null)
    setEditingId(item.id)
    setForm({
      date: normalizeDateInput(item.date),
      resource: item.resource,
      activity: item.activity,
      hours: item.hours,
      notes: item.notes,
    })
    setIsModalOpen(true)
  }

  const closeModal = () => {
    if (isSaving) return
    setIsModalOpen(false)
    setEditingId(null)
  }

  const setFormValue = (key: keyof DailyActivityForm, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const removeItem = async (id: number) => {
    setError(null)

    try {
      const response = await fetch(apiUrl(`/api/daily-activities/${encodeURIComponent(String(id))}`), {
        method: 'DELETE',
        headers: userHeaders,
      })

      if (!response.ok) {
        let detail = 'Falha ao excluir apontamento.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      setItems((prev) => prev.filter((item) => item.id !== id))
      setSuccess('Apontamento excluido com sucesso.')
    } catch (removeError) {
      setError(toFriendlyApiError(removeError, 'Nao foi possivel excluir apontamento.'))
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const resourceValue = editingId || isVisitorUser ? form.resource.trim() : loggedResourceName

    if (!form.date || !resourceValue || !form.activity.trim()) {
      setError('Preencha os campos obrigatorios: data, recurso e atividade.')
      return
    }

    const numericHours = parseHoursValue(form.hours)
    if (!numericHours || numericHours <= 0) {
      setError('Informe horas validas maiores que zero.')
      return
    }

    const payload = {
      date: form.date,
      resource: resourceValue,
      activity: form.activity.trim(),
      hours: numericHours,
      notes: form.notes.trim(),
    }

    try {
      setIsSaving(true)
      const response = await fetch(apiUrl(editingId ? `/api/daily-activities/${encodeURIComponent(String(editingId))}` : '/api/daily-activities'), {
        method: editingId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...userHeaders,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let detail = editingId ? 'Falha ao atualizar apontamento.' : 'Falha ao incluir apontamento.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      const data = await response.json() as { item?: unknown }
      if (!data.item) {
        throw new Error('Resposta invalida ao salvar apontamento.')
      }

      const saved = normalizeActivityResponse(data.item)
      setItems((prev) => {
        if (!editingId) return [saved, ...prev]
        return prev.map((item) => (item.id === editingId ? saved : item))
      })
      setSuccess(editingId ? 'Apontamento atualizado com sucesso.' : 'Apontamento incluido com sucesso.')
      setIsModalOpen(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
    } catch (saveError) {
      setError(toFriendlyApiError(saveError, 'Nao foi possivel salvar apontamento.'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="estimativas-layout">
      <section className="card">
        <div className="estimativas-header-row">
          <div>
            <h2>Apontamentos</h2>
            <p className="muted">Registre as atividades executadas por recurso em cada dia.</p>
          </div>
          <button type="button" className="button-primary" onClick={openModal}>Novo apontamento</button>
        </div>

        <div className="estimativas-stats">
          <span>Total de registros (mes): <strong>{monthItems.length}</strong></span>
          <span>Total de horas (mes): <strong>{formatHoursValue(totalHours)}</strong></span>
          <div className="daily-activities-controls">
            <label className="daily-activities-month-filter">
              <span>Mes</span>
              <input
                type="month"
                value={monthFilter}
                onChange={(event) => setMonthFilter(event.target.value)}
              />
            </label>
            {isVisitorUser && (
              <button type="button" className="button-secondary" onClick={() => void handleExportMonthExcel()}>
                Exportar Excel
              </button>
            )}
            <button type="button" className="button-secondary" onClick={() => void fetchActivities()} disabled={isLoadingRecords}>
              {isLoadingRecords ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </div>

        <div className="estimativas-filters">
          <input
            type="search"
            placeholder="Buscar por data, recurso, atividade ou observacao..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div />
        </div>

        <div className="estimativas-table">
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Data</th>
                <th>Recurso</th>
                <th>Atividade</th>
                <th>Horas</th>
                <th>Observacoes</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.id}</td>
                  <td>{toDisplayDate(item.date)}</td>
                  <td>{item.resource}</td>
                  <td>{item.activity}</td>
                  <td>{formatHoursValue(parseHoursValue(item.hours))}</td>
                  <td>{item.notes || '-'}</td>
                  <td>
                    <div className="estimativas-actions">
                      <button type="button" className="button-secondary" onClick={() => openEditModal(item)}>
                        Editar
                      </button>
                      <button type="button" onClick={() => void removeItem(item.id)}>
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!filteredItems.length && <p className="muted">Nenhum apontamento encontrado.</p>}
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
      </section>

      {isModalOpen && (
        <div className="estimativas-modal-overlay" role="presentation" onClick={closeModal}>
          <section className="estimativas-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="estimativas-modal__header">
              <h3>{editingId ? 'Editar apontamento diario' : 'Novo apontamento diario'}</h3>
              <button type="button" className="button-secondary" onClick={closeModal} disabled={isSaving}>
                Fechar
              </button>
            </div>

            <form className="estimativas-form" onSubmit={handleSubmit}>
              <label>
                Codigo
                <input value={editingId ?? 'Gerado automaticamente'} disabled />
              </label>
              <label>
                Data *
                <input type="date" value={form.date} onChange={(event) => setFormValue('date', event.target.value)} />
              </label>
              <label>
                Recurso *
                {!editingId && isVisitorUser ? (
                  <select value={form.resource} onChange={(event) => setFormValue('resource', event.target.value)}>
                    <option value="">Selecione o recurso</option>
                    {resourceOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={editingId || isVisitorUser ? form.resource : loggedResourceName}
                    onChange={(event) => setFormValue('resource', event.target.value)}
                    placeholder="Nome do recurso"
                    readOnly={!editingId && !isVisitorUser}
                  />
                )}
              </label>
              <label>
                Horas *
                <input value={form.hours} onChange={(event) => setFormValue('hours', event.target.value)} placeholder="Ex: 8" />
              </label>
              <label className="estimativas-form__full">
                Atividade *
                <textarea rows={2} value={form.activity} onChange={(event) => setFormValue('activity', event.target.value)} placeholder="Descreva a atividade executada" />
              </label>
              <label className="estimativas-form__full">
                Observacoes
                <textarea rows={2} value={form.notes} onChange={(event) => setFormValue('notes', event.target.value)} placeholder="Informacoes adicionais" />
              </label>

              <div className="estimativas-actions estimativas-form__full">
                <button type="submit" className="button-primary" disabled={isSaving}>
                  {isSaving ? 'Salvando...' : editingId ? 'Atualizar' : 'Salvar'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
