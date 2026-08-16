import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { apiUrl } from '../lib/api'
import RichTextEditor from './RichTextEditor'

type AtendimentoStatus = 'open' | 'in_progress' | 'done' | 'cancelled'

type AtendimentoRow = {
  id: number
  numero: string
  data: string
  tipo: string
  cliente: string
  solicitante: string
  descricao: string
  responsavel: string
  status: AtendimentoStatus
  observacoes: string
}

type AtendimentoForm = {
  numero: string
  data: string
  tipo: string
  cliente: string
  solicitante: string
  descricao: string
  responsavel: string
  status: AtendimentoStatus
  observacoes: string
}

const EMPTY_FORM: AtendimentoForm = {
  numero: '',
  data: '',
  tipo: '',
  cliente: '',
  solicitante: '',
  descricao: '',
  responsavel: '',
  status: 'open',
  observacoes: '',
}

const STATUS_OPTIONS: { value: AtendimentoStatus; label: string }[] = [
  { value: 'open', label: 'Aberto' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'done', label: 'Concluído' },
  { value: 'cancelled', label: 'Cancelado' },
]

function toStatusLabel(status: AtendimentoStatus): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
}

function toStatusBadgeClass(status: AtendimentoStatus): string {
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

function normalizeStatus(value: unknown): AtendimentoStatus {
  const valid: AtendimentoStatus[] = ['open', 'in_progress', 'done', 'cancelled']
  const s = String(value ?? '').trim() as AtendimentoStatus
  return valid.includes(s) ? s : 'open'
}

function normalizeAtendimentoResponse(input: unknown): AtendimentoRow {
  const row = input as Partial<AtendimentoRow>
  return {
    id: Number(row.id ?? 0),
    numero: String(row.numero ?? ''),
    data: String(row.data ?? ''),
    tipo: String(row.tipo ?? ''),
    cliente: String(row.cliente ?? ''),
    solicitante: String(row.solicitante ?? ''),
    descricao: String(row.descricao ?? ''),
    responsavel: String(row.responsavel ?? ''),
    status: normalizeStatus(row.status),
    observacoes: String(row.observacoes ?? ''),
  }
}

function toFriendlyApiError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return 'Não foi possível conectar na API local. Inicie frontend + API com npm run dev:all.'
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

function generateNextNumber(items: AtendimentoRow[]): string {
  const year = new Date().getFullYear()
  const prefix = `AT-${year}-`
  let maxSeq = 0

  items.forEach((item) => {
    const match = item.numero.match(/^AT-\d{4}-(\d+)$/i)
    if (match) {
      const seq = Number(match[1])
      if (seq > maxSeq) maxSeq = seq
    }
  })

  const next = String(maxSeq + 1).padStart(3, '0')
  return `${prefix}${next}`
}

export default function AtendimentoReportsTool() {
  const [items, setItems] = useState<AtendimentoRow[]>([])
  const [clientOptions, setClientOptions] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | AtendimentoStatus>('all')
  const [isLoadingRecords, setIsLoadingRecords] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formVersion, setFormVersion] = useState(0)
  const [form, setForm] = useState<AtendimentoForm>(EMPTY_FORM)
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchAtendimentos = async () => {
    setError(null)
    setIsLoadingRecords(true)
    try {
      const [itemsResponse, clientsResponse] = await Promise.all([
        fetch(apiUrl('/api/central-servicos/atendimentos')),
        fetch(apiUrl('/api/customer-hub/clients')),
      ])

      if (!itemsResponse.ok) {
        let detail = 'Falha ao carregar atendimentos.'
        try {
          const err = await itemsResponse.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = itemsResponse.statusText || detail
        }
        throw new Error(detail)
      }

      const data = await itemsResponse.json() as { items?: unknown[] }
      const nextItems = Array.isArray(data.items) ? data.items.map(normalizeAtendimentoResponse) : []
      setItems(nextItems)

      if (clientsResponse.ok) {
        const clientsData = await clientsResponse.json() as { items?: unknown[] }
        const names = Array.isArray(clientsData.items)
          ? clientsData.items.map((item) => String((item as { nome?: unknown }).nome ?? '')).filter(Boolean)
          : []
        setClientOptions(names)
      }
    } catch (loadError) {
      setError(toFriendlyApiError(loadError, 'Não foi possível carregar atendimentos.'))
    } finally {
      setIsLoadingRecords(false)
    }
  }

  useEffect(() => {
    void fetchAtendimentos()
  }, [])

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    return items
      .filter((item) => {
        if (statusFilter !== 'all' && item.status !== statusFilter) return false
        if (!term) return true
        return [item.id, item.numero, item.data, item.tipo, item.cliente, item.solicitante, item.descricao, item.responsavel, item.observacoes]
          .join(' ')
          .toLowerCase()
          .includes(term)
      })
      .sort((a, b) => {
        const dateCompare = normalizeDateInput(b.data).localeCompare(normalizeDateInput(a.data))
        if (dateCompare !== 0) return dateCompare
        return b.id - a.id
      })
  }, [items, search, statusFilter])

  const openNew = () => {
    setEditingId(null)
    setForm({ ...EMPTY_FORM, data: getCurrentDateISO(), numero: generateNextNumber(items) })
    setFormVersion((v) => v + 1)
    setError(null)
    setSuccess(null)
    setIsModalOpen(true)
  }

  const openEdit = (item: AtendimentoRow) => {
    setEditingId(item.id)
    setForm({
      numero: item.numero,
      data: normalizeDateInput(item.data),
      tipo: item.tipo,
      cliente: item.cliente,
      solicitante: item.solicitante,
      descricao: item.descricao,
      responsavel: item.responsavel,
      status: item.status,
      observacoes: item.observacoes,
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

  useEffect(() => {
    if (!isModalOpen) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeModal()
      }
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isModalOpen, isSaving])

  const handleFormChange = (field: keyof AtendimentoForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    setIsSaving(true)

    const payload = {
      ...form,
      data: normalizeDateInput(form.data),
    }

    try {
      const isEdit = editingId !== null
      const url = isEdit ? apiUrl(`/api/central-servicos/atendimentos/${editingId}`) : apiUrl('/api/central-servicos/atendimentos')
      const method = isEdit ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let detail = isEdit ? 'Falha ao atualizar atendimento.' : 'Falha ao salvar atendimento.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      const data = await response.json() as { item?: unknown }
      const saved = normalizeAtendimentoResponse(data.item)

      if (isEdit) {
        setItems((prev) => prev.map((i) => (i.id === saved.id ? saved : i)))
        setSuccess('Atendimento atualizado com sucesso.')
      } else {
        setItems((prev) => [saved, ...prev])
        setSuccess('Atendimento cadastrado com sucesso.')
      }

      closeModal()
    } catch (saveError) {
      setError(toFriendlyApiError(saveError, 'Não foi possível salvar o atendimento.'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: number) => {
    if (!window.confirm('Confirma a exclusão deste atendimento?')) return
    setError(null)
    setSuccess(null)
    setIsDeleting(id)

    try {
      const response = await fetch(apiUrl(`/api/central-servicos/atendimentos/${id}`), { method: 'DELETE' })
      if (!response.ok) {
        let detail = 'Falha ao excluir atendimento.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }
      setItems((prev) => prev.filter((i) => i.id !== id))
      setSuccess('Atendimento excluído com sucesso.')
    } catch (deleteError) {
      setError(toFriendlyApiError(deleteError, 'Não foi possível excluir o atendimento.'))
    } finally {
      setIsDeleting(null)
    }
  }

  const countByStatus = useMemo(() => {
    const counts: Record<AtendimentoStatus, number> = { open: 0, in_progress: 0, done: 0, cancelled: 0 }
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
            <h2>Relatórios de Atendimento</h2>
            <p className="muted">Registro e acompanhamento dos atendimentos prestados aos clientes.</p>
          </div>
          <button type="button" className="button-primary" onClick={openNew}>
            Novo atendimento
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
              onChange={(e) => setStatusFilter(e.target.value as 'all' | AtendimentoStatus)}
            >
              <option value="all">Todos os status</option>
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="button-secondary"
              onClick={() => { void fetchAtendimentos() }}
              disabled={isLoadingRecords}
            >
              {isLoadingRecords ? 'Atualizando...' : 'Atualizar'}
            </button>
          </div>
        </div>

        <div className="ch-table-toolbar ch-table-toolbar--single">
          <label className="ch-table-search">
            <span className="ch-table-search__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            </span>
            <input
              type="search"
              placeholder="Buscar por número, cliente, solicitante, descrição..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Buscar atendimento"
            />
          </label>
        </div>

        <div className="estimativas-table ch-table-theme">
          <table>
            <thead>
              <tr>
                <th>Número</th>
                <th>Data</th>
                <th>Tipo</th>
                <th>Cliente</th>
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
                  <td>{item.numero || `#${item.id}`}</td>
                  <td>{toDisplayDate(item.data)}</td>
                  <td>{item.tipo || '-'}</td>
                  <td>{item.cliente || '-'}</td>
                  <td>{item.solicitante}</td>
                  <td>
                    <div
                      className="rich-preview"
                      dangerouslySetInnerHTML={{ __html: item.descricao }}
                    />
                  </td>
                  <td>{item.responsavel || '-'}</td>
                  <td>
                    <span className={toStatusBadgeClass(item.status)}>
                      {toStatusLabel(item.status)}
                    </span>
                  </td>
                  <td>
                    <div className="ch-row-actions ch-row-actions--icons">
                      <button type="button" className="ch-icon-action" title="Editar" onClick={() => openEdit(item)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button type="button" className="ch-icon-action ch-icon-action--danger" title="Excluir" onClick={() => { void handleDelete(item.id) }} disabled={isDeleting === item.id}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!filteredItems.length && <p className="muted">Nenhum atendimento encontrado.</p>}
        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}
      </section>

      {isModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="estimativas-modal-overlay" role="presentation">
          <section
            className="estimativas-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="estimativas-modal__header">
              <h3>{editingId !== null ? 'Editar atendimento' : 'Novo atendimento'}</h3>
              <button type="button" className="button-secondary" onClick={closeModal} disabled={isSaving}>
                Fechar
              </button>
            </div>

            <form className="estimativas-form" onSubmit={(e) => { void handleSubmit(e) }}>
              <label>
                Número
                <input
                  type="text"
                  value={form.numero}
                  readOnly={editingId === null}
                  onChange={(e) => handleFormChange('numero', e.target.value)}
                  placeholder="Gerado automaticamente"
                  style={editingId === null ? { background: '#f0f7f5', cursor: 'default' } : undefined}
                />
              </label>
              <label>
                Data *
                <input
                  type="date"
                  value={form.data}
                  onChange={(e) => handleFormChange('data', e.target.value)}
                  required
                />
              </label>
              <label>
                Tipo
                <input
                  type="text"
                  value={form.tipo}
                  onChange={(e) => handleFormChange('tipo', e.target.value)}
                  placeholder="Ex: Suporte, Consultoria, Implantação"
                />
              </label>
              <label>
                Cliente
                <input
                  list="atendimento-client-options"
                  type="text"
                  value={form.cliente}
                  onChange={(e) => handleFormChange('cliente', e.target.value)}
                  placeholder="Nome do cliente"
                />
                <datalist id="atendimento-client-options">
                  {clientOptions.map((option) => <option key={option} value={option} />)}
                </datalist>
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
                  value={form.solicitante}
                  onChange={(e) => handleFormChange('solicitante', e.target.value)}
                  placeholder="Nome do solicitante"
                  required
                />
              </label>
              <label>
                Responsável *
                <input
                  type="text"
                  value={form.responsavel}
                  onChange={(e) => handleFormChange('responsavel', e.target.value)}
                  placeholder="Responsável pelo atendimento"
                  required
                />
              </label>
              <div className="estimativas-form__full" style={{ display: 'grid', gap: '0.38rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink-primary)' }}>
                Descrição *
                <RichTextEditor
                  key={`desc-${formVersion}`}
                  value={form.descricao}
                  onChange={(html) => handleFormChange('descricao', html)}
                  placeholder="Descrição detalhada do atendimento"
                  rows={4}
                  disabled={isSaving}
                />
              </div>
              <div className="estimativas-form__full" style={{ display: 'grid', gap: '0.38rem', fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink-primary)' }}>
                Observações
                <RichTextEditor
                  key={`notes-${formVersion}`}
                  value={form.observacoes}
                  onChange={(html) => handleFormChange('observacoes', html)}
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
