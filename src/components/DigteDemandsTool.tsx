import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { apiUrl } from '../lib/api'
import RichTextEditor from './RichTextEditor'

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
  const [formVersion, setFormVersion] = useState(0)
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
    setFormVersion((v) => v + 1)
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
    setFormVersion((v) => v + 1)
    setError(null)
    setSuccess(null)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    if (isSaving) return
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
    <div className="estimativas-layout">
      <section className="card">
        <div className="estimativas-header-row">
          <div>
            <h2>Demandas DIGTE</h2>
            <p className="muted">Registro e acompanhamento das demandas atendidas.</p>
          </div>
          <button type="button" className="button-primary" onClick={openNew}>
            Nova demanda
          </button>
        </div>

        <div className="estimativas-stats">
          {STATUS_OPTIONS.map((opt) => (
            <span key={opt.value}>
              {opt.label}: <strong>{countByStatus[opt.value]}</strong>
            </span>
          ))}
          <span>Total: <strong>{items.length}</strong></span>
          <div className="daily-activities-controls">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | DemandStatus)}
            >
              <option value="all">Todos os status</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="button-secondary"
              onClick={() => { void fetchDemands() }}
              disabled={isLoadingRecords}
            >
              {isLoadingRecords ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </div>

        <div className="estimativas-filters">
          <input
            type="search"
            placeholder="Buscar por numero, solicitante, descricao..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div />
        </div>

        <div className="estimativas-table">
          <table>
            <thead>
              <tr>
                <th>Numero</th>
                <th>Data</th>
                <th>Tipo</th>
                <th>Solicitante</th>
                <th>Descrição</th>
                <th>Responsável</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.number || `#${item.id}`}</td>
                  <td>{toDisplayDate(item.date)}</td>
                  <td>{item.type || '-'}</td>
                  <td>{item.requester}</td>
                  <td>
                    <div
                      className="rich-preview"
                      dangerouslySetInnerHTML={{ __html: item.description }}
                    />
                  </td>
                  <td>{item.responsible || '-'}</td>
                  <td>
                    <span className={toStatusBadgeClass(item.status)}>
                      {toStatusLabel(item.status)}
                    </span>
                  </td>
                  <td>
                    <div className="estimativas-actions">
                      <button type="button" className="button-secondary" onClick={() => openEdit(item)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => { void handleDelete(item.id) }}
                        disabled={isDeleting === item.id}
                      >
                        {isDeleting === item.id ? '...' : 'Excluir'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!filteredItems.length && <p className="muted">Nenhuma demanda encontrada.</p>}
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
      </section>

      {isModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="estimativas-modal-overlay" role="presentation" onClick={closeModal}>
          <section
            className="estimativas-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="estimativas-modal__header">
              <h3>{editingId !== null ? 'Editar demanda' : 'Nova demanda'}</h3>
              <button type="button" className="button-secondary" onClick={closeModal} disabled={isSaving}>
                Fechar
              </button>
            </div>

            <form className="estimativas-form" onSubmit={(e) => { void handleSubmit(e) }}>
              <label>
                Numero
                <input
                  type="text"
                  value={form.number}
                  readOnly={editingId === null}
                  onChange={(e) => handleFormChange('number', e.target.value)}
                  placeholder="Gerado automaticamente"
                  style={editingId === null ? { background: '#f0f7f5', cursor: 'default' } : undefined}
                />
              </label>
              <label>
                Data *
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
                Solicitante *
                <input
                  type="text"
                  value={form.requester}
                  onChange={(e) => handleFormChange('requester', e.target.value)}
                  placeholder="Nome do solicitante"
                  required
                />
              </label>
              <label>
                Responsável *
                <input
                  type="text"
                  value={form.responsible}
                  onChange={(e) => handleFormChange('responsible', e.target.value)}
                  placeholder="Responsável pelo atendimento"
                  required
                />
              </label>
              <div className="estimativas-form__full" style={{ display: 'grid', gap: '0.38rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink-primary)' }}>
                Descrição *
                <RichTextEditor
                  key={`desc-${formVersion}`}
                  value={form.description}
                  onChange={(html) => handleFormChange('description', html)}
                  placeholder="Descrição detalhada da demanda"
                  rows={4}
                  disabled={isSaving}
                />
              </div>
              <div className="estimativas-form__full" style={{ display: 'grid', gap: '0.38rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink-primary)' }}>
                Observações
                <RichTextEditor
                  key={`notes-${formVersion}`}
                  value={form.notes}
                  onChange={(html) => handleFormChange('notes', html)}
                  placeholder="Informações adicionais (opcional)"
                  rows={3}
                  disabled={isSaving}
                />
              </div>

              <div className="estimativas-actions estimativas-form__full">
                <button type="submit" className="button-primary" disabled={isSaving}>
                  {isSaving ? 'Salvando...' : editingId !== null ? 'Atualizar' : 'Salvar'}
                </button>
              </div>
            </form>
          </section>
        </div>,
        document.body,
      )}
    </div>
  )
}

