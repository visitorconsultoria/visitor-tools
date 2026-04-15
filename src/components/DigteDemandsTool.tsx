import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { apiUrl } from '../lib/api'

type DemandStatus = 'open' | 'in_progress' | 'done' | 'cancelled'

type DigteDemandRow = {
  id: number
  number: string
  date: string
  type: string
  requester: string
  description: string
  responsible: string
  status: DemandStatus
  notes: string
}

type DigteDemandForm = {
  number: string
  date: string
  type: string
  requester: string
  description: string
  responsible: string
  status: DemandStatus
  notes: string
}

const EMPTY_FORM: DigteDemandForm = {
  number: '',
  date: '',
  type: '',
  requester: '',
  description: '',
  responsible: '',
  status: 'open',
  notes: '',
}

const STATUS_OPTIONS: { value: DemandStatus; label: string }[] = [
  { value: 'open', label: 'Aberta' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'done', label: 'Concluida' },
  { value: 'cancelled', label: 'Cancelada' },
]

function toStatusLabel(status: DemandStatus): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
}

function toStatusBadgeClass(status: DemandStatus): string {
  if (status === 'done') return 'badge badge--done'
  if (status === 'in_progress') return 'badge badge--in-progress'
  if (status === 'cancelled') return 'badge badge--cancelled'
  return 'badge badge--open'
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

function normalizeStatus(value: unknown): DemandStatus {
  const valid: DemandStatus[] = ['open', 'in_progress', 'done', 'cancelled']
  const s = String(value ?? '').trim() as DemandStatus
  return valid.includes(s) ? s : 'open'
}

function normalizeDemandResponse(input: unknown): DigteDemandRow {
  const row = input as Partial<DigteDemandRow>
  return {
    id: Number(row.id ?? 0),
    number: String(row.number ?? ''),
    date: String(row.date ?? ''),
    type: String(row.type ?? ''),
    requester: String(row.requester ?? ''),
    description: String(row.description ?? ''),
    responsible: String(row.responsible ?? ''),
    status: normalizeStatus(row.status),
    notes: String(row.notes ?? ''),
  }
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

function getCurrentDateISO(): string {
  const now = new Date()
  return now.toISOString().slice(0, 10)
}

function generateNextNumber(items: DigteDemandRow[]): string {
  const year = new Date().getFullYear()
  const prefix = `DIG-${year}-`
  let maxSeq = 0

  items.forEach((item) => {
    const match = item.number.match(/^DIG-\d{4}-(\d+)$/i)
    if (match) {
      const seq = Number(match[1])
      if (seq > maxSeq) maxSeq = seq
    }
  })

  const next = String(maxSeq + 1).padStart(3, '0')
  return `${prefix}${next}`
}

export default function DigteDemandsTool() {
  const [items, setItems] = useState<DigteDemandRow[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | DemandStatus>('all')
  const [isLoadingRecords, setIsLoadingRecords] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<DigteDemandForm>(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchDemands = async () => {
    setError(null)
    setIsLoadingRecords(true)
    try {
      const response = await fetch(apiUrl('/api/digte-demands'))
      if (!response.ok) {
        let detail = 'Falha ao carregar demandas.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }
      const data = await response.json() as { items?: unknown[] }
      const nextItems = Array.isArray(data.items) ? data.items.map(normalizeDemandResponse) : []
      setItems(nextItems)
    } catch (loadError) {
      setError(toFriendlyApiError(loadError, 'Nao foi possivel carregar demandas.'))
    } finally {
      setIsLoadingRecords(false)
    }
  }

  useEffect(() => {
    void fetchDemands()
  }, [])

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items
      .filter((item) => {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false
        if (!term) return true
        return [item.id, item.number, item.date, item.type, item.requester, item.description, item.responsible, item.notes]
          .join(' ')
          .toLowerCase()
          .includes(term)
      })
      .sort((a, b) => {
        const dateCompare = normalizeDateInput(b.date).localeCompare(normalizeDateInput(a.date))
        if (dateCompare !== 0) return dateCompare
        return b.id - a.id
      })
  }, [items, search, statusFilter])

  const openNew = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, date: getCurrentDateISO(), number: generateNextNumber(items) })
    setError(null)
    setSuccess(null)
    setIsModalOpen(true)
  }

  const openEdit = (item: DigteDemandRow) => {
    setEditingId(item.id)
    setForm({
      number: item.number,
      date: normalizeDateInput(item.date),
      type: item.type,
      requester: item.requester,
      description: item.description,
      responsible: item.responsible,
      status: item.status,
      notes: item.notes,
    })
    setError(null)
    setSuccess(null)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const handleFormChange = (field: keyof DigteDemandForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    setIsSaving(true)

    const payload = {
      ...form,
      date: normalizeDateInput(form.date),
    }

    try {
      const isEdit = editingId !== null
      const url = isEdit ? apiUrl(`/api/digte-demands/${editingId}`) : apiUrl('/api/digte-demands')
      const method = isEdit ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let detail = isEdit ? 'Falha ao atualizar demanda.' : 'Falha ao salvar demanda.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      const data = await response.json() as { item?: unknown }
      const saved = normalizeDemandResponse(data.item)

      if (isEdit) {
        setItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)))
        setSuccess('Demanda atualizada com sucesso.')
      } else {
        setItems((prev) => [saved, ...prev])
        setSuccess('Demanda cadastrada com sucesso.')
      }

      closeModal()
    } catch (saveError) {
      setError(toFriendlyApiError(saveError, 'Nao foi possivel salvar a demanda.'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Confirma a exclusao desta demanda?')) return
    setError(null)
    setSuccess(null)
    setIsDeleting(id)

    try {
      const response = await fetch(apiUrl(`/api/digte-demands/${id}`), { method: 'DELETE' })
      if (!response.ok) {
        let detail = 'Falha ao excluir demanda.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }
      setItems((prev) => prev.filter((i) => i.id !== id))
      setSuccess('Demanda excluida com sucesso.')
    } catch (deleteError) {
      setError(toFriendlyApiError(deleteError, 'Nao foi possivel excluir a demanda.'))
    } finally {
      setIsDeleting(null)
    }
  }

  const countByStatus = useMemo(() => {
    const counts: Record<DemandStatus, number> = { open: 0, in_progress: 0, done: 0, cancelled: 0 }
    items.forEach((item) => {
      counts[item.status] = (counts[item.status] ?? 0) + 1
    })
    return counts
  }, [items])

  return (
    <div className="daily-activity-tool">
      {error && <p className="error" role="alert">{error}</p>}
      {success && <p className="success" role="status">{success}</p>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          {STATUS_OPTIONS.map((opt) => (
            <div key={opt.value} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
              <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>{countByStatus[opt.value]}</span>
              <span className={toStatusBadgeClass(opt.value)}>{opt.label}</span>
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ fontSize: '1.5rem', fontWeight: 700 }}>{items.length}</span>
            <span className="badge">Total</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="results__header">
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', flex: 1 }}>
            <input
              type="search"
              placeholder="Buscar demandas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, minWidth: '180px' }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | DemandStatus)}
              style={{ minWidth: '160px' }}
            >
              <option value="all">Todos os status</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="button-secondary"
              onClick={() => { void fetchDemands() }}
              disabled={isLoadingRecords}
            >
              {isLoadingRecords ? 'Carregando...' : 'Atualizar'}
            </button>
            <button
              type="button"
              className="button-primary"
              onClick={openNew}
            >
              Nova demanda
            </button>
          </div>
        </div>

        {isLoadingRecords && <p className="muted">Carregando demandas...</p>}

        {!isLoadingRecords && filteredItems.length === 0 && (
          <p className="muted">Nenhuma demanda encontrada.</p>
        )}

        {filteredItems.length > 0 && (
          <div className="csv-table" style={{ marginTop: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Nro</th>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>Solicitante</th>
                  <th>Descricao</th>
                  <th>Responsavel</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{item.number || `#${item.id}`}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{toDisplayDate(item.date)}</td>
                    <td>{item.type}</td>
                    <td>{item.requester}</td>
                    <td style={{ maxWidth: '260px' }}>{item.description}</td>
                    <td>{item.responsible}</td>
                    <td>
                      <span className={toStatusBadgeClass(item.status)}>
                        {toStatusLabel(item.status)}
                      </span>
                    </td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="button-secondary"
                        style={{ marginRight: '0.5rem', padding: '0.25rem 0.6rem', fontSize: '0.85rem' }}
                        onClick={() => openEdit(item)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="button-danger"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.85rem' }}
                        onClick={() => { void handleDelete(item.id) }}
                        disabled={isDeleting === item.id}
                      >
                        {isDeleting === item.id ? '...' : 'Excluir'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={editingId !== null ? 'Editar demanda' : 'Nova demanda'}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal() }}
        >
          <div
            style={{
              background: '#fff', borderRadius: '12px', padding: '2rem',
              width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: '1.5rem' }}>
              {editingId !== null ? 'Editar demanda' : 'Nova demanda'}
            </h2>

            {error && <p className="error" role="alert">{error}</p>}

            <form onSubmit={(e) => { void handleSubmit(e) }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <label>
                  Numero
                  <input
                    type="text"
                    value={form.number}
                    readOnly={editingId === null}
                    onChange={(e) => handleFormChange('number', e.target.value)}
                    placeholder="Ex: DIG-2026-001"
                    style={editingId === null ? { background: '#f0f7f5', cursor: 'default' } : undefined}
                  />
                </label>
                <label>
                  Data <span style={{ color: '#d97706' }}>*</span>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => handleFormChange('date', e.target.value)}
                    required
                  />
                </label>
                <label>
                  Tipo
                  <input
                    type="text"
                    value={form.type}
                    onChange={(e) => handleFormChange('type', e.target.value)}
                    placeholder="Ex: Desenvolvimento, Suporte"
                  />
                </label>
                <label>
                  Status
                  <select
                    value={form.status}
                    onChange={(e) => handleFormChange('status', e.target.value)}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Solicitante <span style={{ color: '#d97706' }}>*</span>
                  <input
                    type="text"
                    value={form.requester}
                    onChange={(e) => handleFormChange('requester', e.target.value)}
                    placeholder="Nome do solicitante"
                    required
                  />
                </label>
                <label>
                  Responsavel <span style={{ color: '#d97706' }}>*</span>
                  <input
                    type="text"
                    value={form.responsible}
                    onChange={(e) => handleFormChange('responsible', e.target.value)}
                    placeholder="Responsavel pelo atendimento"
                    required
                  />
                </label>
              </div>

              <label style={{ marginTop: '1rem', display: 'block' }}>
                Descricao <span style={{ color: '#d97706' }}>*</span>
                <textarea
                  value={form.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  placeholder="Descricao detalhada da demanda"
                  rows={3}
                  required
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </label>

              <label style={{ marginTop: '1rem', display: 'block' }}>
                Observacoes
                <textarea
                  value={form.notes}
                  onChange={(e) => handleFormChange('notes', e.target.value)}
                  placeholder="Informacoes adicionais (opcional)"
                  rows={2}
                  style={{ width: '100%', resize: 'vertical' }}
                />
              </label>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="button-secondary" onClick={closeModal} disabled={isSaving}>
                  Cancelar
                </button>
                <button type="submit" className="button-primary" disabled={isSaving}>
                  {isSaving ? 'Salvando...' : editingId !== null ? 'Salvar alteracoes' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
