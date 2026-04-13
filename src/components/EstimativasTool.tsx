import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { jsPDF } from 'jspdf'
import internalPartnerLogo from '../assets/logo_3.png'
import { apiUrl } from '../lib/api'

type EstimateStatus = 'pending' | 'sent'

type EstimateItem = {
  id: number
  detail: string
  hours: string
}

type EstimateRow = {
  id: number
  partner: string
  client: string
  date: string
  demand: string
  notes: string
  status: EstimateStatus
  items: EstimateItem[]
}

type FormItem = {
  detail: string
  hours: string
}

type FormState = {
  partner: string
  client: string
  date: string
  demand: string
  notes: string
  status: EstimateStatus
  items: FormItem[]
}

const EMPTY_FORM: FormState = {
  partner: '',
  client: '',
  date: '',
  demand: '',
  notes: '',
  status: 'pending',
  items: [{ detail: '', hours: '' }],
}

const PARTNER_OPTIONS = ['Interno', 'DWC', 'Newtech'] as const

function toISODate(value: string): string {
  if (!value) return ''
  const trimmed = value.trim()

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const br = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`

  return trimmed
}

function toDisplayDate(value: string): string {
  const iso = toISODate(value)
  if (!iso) return value
  const [year, month, day] = iso.split('-')
  return `${day}/${month}/${year}`
}

function toStatusLabel(status: EstimateStatus): string {
  return status === 'sent' ? 'Enviado' : 'Pendente'
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

function getItemsTotalHours(items: Array<{ hours: string }>): number {
  return items.reduce((sum, item) => sum + parseHoursValue(item.hours), 0)
}

function toSafePdfFilename(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'estimativa'
}

function isInternalPartner(partner: string): boolean {
  return partner.trim().toLowerCase() === 'interno'
}

async function loadImageAsDataUrl(src: string): Promise<string | null> {
  try {
    const response = await fetch(src)
    if (!response.ok) return null

    const blob = await response.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(new Error('Falha ao processar logo para PDF.'))
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function normalizeEstimateResponse(input: unknown): EstimateRow {
  const row = input as Partial<EstimateRow>
  const items = Array.isArray(row.items) ? row.items : []

  return {
    id: Number(row.id ?? 0),
    partner: String(row.partner ?? ''),
    client: String(row.client ?? ''),
    date: String(row.date ?? ''),
    demand: String(row.demand ?? ''),
    notes: String(row.notes ?? ''),
    status: row.status === 'sent' ? 'sent' : 'pending',
    items: items.map((item, index) => {
      const itemData = item as Partial<EstimateItem>
      return {
        id: Number(itemData.id ?? index + 1),
        detail: String(itemData.detail ?? ''),
        hours: String(itemData.hours ?? ''),
      }
    }),
  }
}

function toFriendlyApiError(error: unknown, fallback: string): string {
  if (error instanceof TypeError) {
    return 'Nao foi possivel conectar na API local. Inicie frontend + API com npm run dev:all.'
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (
      message.includes('failed to fetch')
      || message.includes('networkerror')
      || message.includes('network error')
      || message.includes('internal server error')
      || message.includes('econnrefused')
    ) {
      return 'Nao foi possivel conectar na API local. Inicie frontend + API com npm run dev:all.'
    }
    return error.message
  }

  return fallback
}

export default function EstimativasTool() {
  const [items, setItems] = useState<EstimateRow[]>([])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | EstimateStatus>('all')
  const [isLoadingRecords, setIsLoadingRecords] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isViewMode, setIsViewMode] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const modalRef = useRef<HTMLElement | null>(null)

  const fetchEstimates = async () => {
    setError(null)
    setIsLoadingRecords(true)

    try {
      const response = await fetch(apiUrl('/api/estimativas'))
      if (!response.ok) {
        let detail = 'Falha ao carregar estimativas.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      const data = await response.json() as { items?: unknown[] }
      const nextItems = Array.isArray(data.items) ? data.items.map(normalizeEstimateResponse) : []
      setItems(nextItems)
    } catch (loadError) {
        setError(toFriendlyApiError(loadError, 'Nao foi possivel carregar estimativas.'))
    } finally {
      setIsLoadingRecords(false)
    }
  }

  useEffect(() => {
    void fetchEstimates()
  }, [])

  useEffect(() => {
    if (!isModalOpen) return
    if (!modalRef.current) return
    modalRef.current.scrollTop = 0
  }, [isModalOpen, editingId, isViewMode])

  const stats = useMemo(() => {
    const total = items.length
    const sent = items.filter((item) => item.status === 'sent').length
    return {
      total,
      sent,
      pending: total - sent,
    }
  }, [items])

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()

    return items
      .filter((item) => (statusFilter === 'all' ? true : item.status === statusFilter))
      .filter((item) => {
        if (!term) return true
        const itemText = item.items.map((detailItem) => `${detailItem.detail} ${detailItem.hours}`).join(' ')
        return [item.id, item.partner, item.client, item.demand, item.notes, itemText]
          .join(' ')
          .toLowerCase()
          .includes(term)
      })
        .sort((a, b) => b.id - a.id)
  }, [items, search, statusFilter])

  const modalTotalHours = useMemo(() => getItemsTotalHours(form.items), [form.items])

  const openModal = () => {
    setError(null)
    setSuccess(null)
    setForm(EMPTY_FORM)
    setEditingId(null)
    setIsViewMode(false)
    setIsModalOpen(true)
  }

  const openEditModal = (estimate: EstimateRow) => {
    setError(null)
    setSuccess(null)
    setEditingId(estimate.id)
    setForm({
      partner: estimate.partner,
      client: estimate.client,
      date: toISODate(estimate.date),
      demand: estimate.demand,
      notes: estimate.notes,
      status: estimate.status,
      items: estimate.items.length
        ? estimate.items.map((item) => ({ detail: item.detail, hours: item.hours }))
        : [{ detail: '', hours: '' }],
    })
    setIsViewMode(false)
    setIsModalOpen(true)
  }

  const openViewModal = (estimate: EstimateRow) => {
    setError(null)
    setSuccess(null)
    setEditingId(estimate.id)
    setForm({
      partner: estimate.partner,
      client: estimate.client,
      date: toISODate(estimate.date),
      demand: estimate.demand,
      notes: estimate.notes,
      status: estimate.status,
      items: estimate.items.length
        ? estimate.items.map((item) => ({ detail: item.detail, hours: item.hours }))
        : [{ detail: '', hours: '' }],
    })
    setIsViewMode(true)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    if (isSaving) return
    setIsModalOpen(false)
    setEditingId(null)
    setIsViewMode(false)
  }

  const setFormValue = (key: keyof Omit<FormState, 'items'>, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  const setFormItemValue = (index: number, key: keyof FormItem, value: string) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)),
    }))
  }

  const addFormItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, { detail: '', hours: '' }],
    }))
  }

  const removeFormItem = (index: number) => {
    setForm((prev) => {
      if (prev.items.length <= 1) return prev
      return {
        ...prev,
        items: prev.items.filter((_, itemIndex) => itemIndex !== index),
      }
    })
  }

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isViewMode) return
    setError(null)
    setSuccess(null)

    if (!form.partner.trim() || !form.client.trim() || !form.date || !form.demand.trim()) {
      setError('Preencha os campos obrigatorios: partner, client, date e demand.')
      return
    }

    const normalizedItems = form.items
      .map((item) => ({
        detail: item.detail.trim(),
        hours: item.hours.replace(',', '.').trim(),
      }))
      .filter((item) => item.detail || item.hours)

    if (!normalizedItems.length) {
      setError('Adicione ao menos um item de detail/hours.')
      return
    }

    const invalidHours = normalizedItems.some((item) => Number.isNaN(Number(item.hours)) || Number(item.hours) <= 0)
    if (invalidHours) {
      setError('Todos os itens devem ter hours numerica maior que zero.')
      return
    }

    const payload = {
      partner: form.partner.trim(),
      client: form.client.trim(),
      date: form.date,
      demand: form.demand.trim(),
      notes: form.notes.trim(),
      status: form.status,
      items: normalizedItems,
    }

    try {
      setIsSaving(true)
      const response = await fetch(apiUrl(editingId ? `/api/estimativas/${encodeURIComponent(String(editingId))}` : '/api/estimativas'), {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let detail = editingId ? 'Falha ao atualizar estimativa.' : 'Falha ao incluir estimativa.'
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
        throw new Error('Resposta invalida do servidor ao salvar estimativa.')
      }

      const saved = normalizeEstimateResponse(data.item)
      setItems((prev) => {
        if (!editingId) return [saved, ...prev]
        return prev.map((item) => (item.id === editingId ? saved : item))
      })
      setSuccess(editingId ? 'Estimativa atualizada com sucesso.' : 'Estimativa incluida com sucesso.')
      setIsModalOpen(false)
      setEditingId(null)
      setIsViewMode(false)
      setForm(EMPTY_FORM)
    } catch (createError) {
        setError(toFriendlyApiError(createError, 'Nao foi possivel salvar estimativa.'))
    } finally {
      setIsSaving(false)
    }
  }

  const toggleStatus = async (estimate: EstimateRow) => {
    setError(null)
    const nextStatus: EstimateStatus = estimate.status === 'sent' ? 'pending' : 'sent'

    try {
      const response = await fetch(apiUrl(`/api/estimativas/${encodeURIComponent(String(estimate.id))}/status`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })

      if (!response.ok) {
        let detail = 'Falha ao atualizar status.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      setItems((prev) => prev.map((item) => (item.id === estimate.id ? { ...item, status: nextStatus } : item)))
    } catch (statusError) {
        setError(toFriendlyApiError(statusError, 'Nao foi possivel atualizar status.'))
    }
  }

  const removeEstimate = async (id: number) => {
    setError(null)

    try {
      const response = await fetch(apiUrl(`/api/estimativas/${encodeURIComponent(String(id))}`), {
        method: 'DELETE',
      })

      if (!response.ok) {
        let detail = 'Falha ao excluir estimativa.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch (removeError) {
        setError(toFriendlyApiError(removeError, 'Nao foi possivel excluir estimativa.'))
    }
  }

  const printEstimatePdf = async (estimate: EstimateRow) => {
    setError(null)

    try {
      const branded = isInternalPartner(estimate.partner)
      const totalHours = getItemsTotalHours(estimate.items)
      const doc = new jsPDF({ unit: 'pt', format: 'a4' })
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const margin = 40
      const contentWidth = pageWidth - margin * 2
      let y = margin

      const ensureSpace = (required: number) => {
        if (y + required <= pageHeight - margin) return
        doc.addPage()
        y = margin
      }

      const writeWrapped = (
        text: string,
        opts: {
          x: number
          y: number
          width: number
          size?: number
          color?: [number, number, number]
          style?: 'normal' | 'bold'
          lineHeight?: number
        },
      ) => {
        const {
          x,
          y: yPos,
          width,
          size = 10,
          color = [30, 56, 49],
          style = 'normal',
          lineHeight = 1.35,
        } = opts

        doc.setFont('helvetica', style)
        doc.setFontSize(size)
        doc.setTextColor(color[0], color[1], color[2])
        const lines = doc.splitTextToSize(text || '-', width)
        doc.text(lines, x, yPos, { lineHeightFactor: lineHeight })
        return lines.length * size * lineHeight
      }

      if (branded) {
        doc.setFillColor(228, 242, 237)
        doc.roundedRect(margin, y, contentWidth, 98, 10, 10, 'F')

        const logoDataUrl = await loadImageAsDataUrl(internalPartnerLogo)
        if (logoDataUrl) {
          const logoAnchorX = margin + 14
          const logoCenterY = y + 49
          const logoTargetHeight = 56
          const logoMaxWidth = 170
          const logoProps = doc.getImageProperties(logoDataUrl)
          const logoRatio = logoProps.width / logoProps.height
          const targetWidth = logoTargetHeight * logoRatio
          const drawWidth = Math.min(targetWidth, logoMaxWidth)
          const drawHeight = drawWidth / logoRatio
          const drawX = logoAnchorX
          const drawY = logoCenterY - (drawHeight / 2)
          doc.addImage(logoDataUrl, 'PNG', drawX, drawY, drawWidth, drawHeight)
        }

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(18)
        doc.setTextColor(21, 68, 58)
        doc.text(`Estimativa #${estimate.id}`, pageWidth - margin - 14, y + 34, { align: 'right' })

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(58, 104, 92)
        doc.text(`Documento gerado em ${new Date().toLocaleString('pt-BR')}`, pageWidth - margin - 14, y + 56, {
          align: 'right',
        })
        y += 120
      } else {
        doc.setFillColor(244, 244, 244)
        doc.roundedRect(margin, y, contentWidth, 98, 10, 10, 'F')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(18)
        doc.setTextColor(44, 44, 44)
        doc.text(`Estimativa #${estimate.id}`, margin + 14, y + 34)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(86, 86, 86)
        doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, margin + 14, y + 70)
        y += 120
      }

      ensureSpace(130)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(branded ? 21 : 44, branded ? 68 : 44, branded ? 58 : 44)
      doc.text('Dados principais', margin, y)
      y += 16

      const labelColor: [number, number, number] = branded ? [32, 78, 68] : [80, 80, 80]
      const valueColor: [number, number, number] = branded ? [26, 58, 51] : [40, 40, 40]

      const rows: Array<[string, string]> = [
        ['Codigo', String(estimate.id)],
        ['Parceiro', estimate.partner],
        ['Cliente', estimate.client],
        ['Data', toDisplayDate(estimate.date)],
        ['Demanda', estimate.demand],
        ['Status', toStatusLabel(estimate.status)],
        ['Horas totais', formatHoursValue(totalHours)],
      ]

      rows.forEach(([label, value]) => {
        ensureSpace(22)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(labelColor[0], labelColor[1], labelColor[2])
        doc.text(`${label}:`, margin, y)

        const used = writeWrapped(value || '-', {
          x: margin + 78,
          y,
          width: contentWidth - 78,
          size: 10,
          color: valueColor,
        })
        y += Math.max(20, used + 2)
      })

      ensureSpace(70)
      y += 4
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(branded ? 21 : 44, branded ? 68 : 44, branded ? 58 : 44)
      doc.text('Observações', margin, y)
      y += 16
      y += writeWrapped(estimate.notes || '-', {
        x: margin,
        y,
        width: contentWidth,
        size: 10,
        color: valueColor,
      }) + 8

      ensureSpace(56)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(branded ? 21 : 44, branded ? 68 : 44, branded ? 58 : 44)
      doc.text('Itens de detalhe e horas', margin, y)
      y += 14

      if (!estimate.items.length) {
        y += writeWrapped('Nenhum item informado.', {
          x: margin,
          y,
          width: contentWidth,
          size: 10,
          color: valueColor,
        })
      } else {
        estimate.items.forEach((item, index) => {
          ensureSpace(40)
          doc.setDrawColor(branded ? 194 : 214, branded ? 221 : 214, branded ? 213 : 214)
          doc.setFillColor(branded ? 246 : 248, branded ? 252 : 248, branded ? 249 : 248)
          doc.roundedRect(margin, y, contentWidth, 28, 6, 6, 'FD')

          doc.setFont('helvetica', 'bold')
          doc.setFontSize(10)
          doc.setTextColor(valueColor[0], valueColor[1], valueColor[2])
          doc.text(`#${index + 1}`, margin + 10, y + 18)

          const detailPreview = item.detail || '-'
          const detailLines = doc.splitTextToSize(detailPreview, contentWidth - 165)
          doc.setFont('helvetica', 'normal')
          doc.text(detailLines[0] || '-', margin + 38, y + 18)

          doc.setFont('helvetica', 'bold')
          doc.text(`Horas: ${item.hours || '-'}`, pageWidth - margin - 10, y + 18, { align: 'right' })

          y += 34
        })
      }

      ensureSpace(36)
      doc.setDrawColor(branded ? 180 : 206, branded ? 214 : 206, branded ? 203 : 206)
      doc.setFillColor(branded ? 236 : 243, branded ? 247 : 243, branded ? 242 : 243)
      doc.roundedRect(margin, y, contentWidth, 24, 6, 6, 'FD')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(valueColor[0], valueColor[1], valueColor[2])
      doc.text(`Total de horas: ${formatHoursValue(totalHours)}`, pageWidth - margin - 10, y + 16, { align: 'right' })
      y += 30

      const fileName = toSafePdfFilename(`estimativa-${estimate.id}-${estimate.client || 'cliente'}`)
      doc.save(`${fileName}.pdf`)
      setSuccess(`PDF da estimativa ${estimate.id} gerado com sucesso.`)
    } catch (printError) {
      setError(toFriendlyApiError(printError, 'Nao foi possivel gerar o PDF da estimativa.'))
    }
  }

  return (
    <div className="estimativas-layout">
      <section className="card">
        <div className="estimativas-header-row">
          <div>
            <h2>Registros de Estimativas</h2>
            <p className="muted">Tabela principal com codigo, parceiro, cliente, data, demanda e status.</p>
          </div>
          <button type="button" className="button-primary" onClick={openModal}>Incluir</button>
        </div>

        <div className="estimativas-stats">
          <span>Total: <strong>{stats.total}</strong></span>
          <span>Pendentes: <strong>{stats.pending}</strong></span>
          <span>Enviadas: <strong>{stats.sent}</strong></span>
          <button type="button" className="button-secondary" onClick={() => void fetchEstimates()} disabled={isLoadingRecords}>
            {isLoadingRecords ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>

        <div className="estimativas-filters">
          <input
            type="search"
            placeholder="Buscar por codigo, parceiro, cliente, demanda..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | EstimateStatus)}>
            <option value="all">Todos</option>
            <option value="pending">Pendentes</option>
            <option value="sent">Enviadas</option>
          </select>
        </div>

        <div className="estimativas-table">
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Parceiro</th>
                <th>Cliente</th>
                <th>Data</th>
                <th>Demanda</th>
                <th>Total Horas</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((estimate) => (
                <tr key={estimate.id}>
                  <td>{estimate.id}</td>
                  <td>{estimate.partner}</td>
                  <td>{estimate.client}</td>
                  <td>{toDisplayDate(estimate.date)}</td>
                  <td>{estimate.demand}</td>
                  <td>{formatHoursValue(getItemsTotalHours(estimate.items))}</td>
                  <td>
                    <span className={`estimativas-status estimativas-status--${estimate.status}`}>
                      {toStatusLabel(estimate.status)}
                    </span>
                  </td>
                  <td>
                    <div className="estimativas-actions">
                      <button type="button" className="button-secondary" onClick={() => openViewModal(estimate)}>
                        Visualizar
                      </button>
                      <button type="button" className="button-secondary" onClick={() => void printEstimatePdf(estimate)}>
                        Imprimir
                      </button>
                      <button type="button" className="button-secondary" onClick={() => openEditModal(estimate)}>
                        Editar
                      </button>
                      <button type="button" className="button-secondary" onClick={() => void toggleStatus(estimate)}>
                        {estimate.status === 'sent' ? 'Marcar como pendente' : 'Marcar como enviado'}
                      </button>
                      <button type="button" onClick={() => void removeEstimate(estimate.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!filteredItems.length && <p className="muted">Nenhum registro encontrado para os filtros atuais.</p>}
        {error && (
          <div className="estimativas-actions" style={{ marginTop: '0.65rem' }}>
            <p className="error" style={{ margin: 0 }}>{error}</p>
            <button type="button" className="button-secondary" onClick={() => void fetchEstimates()}>
              Tentar novamente
            </button>
          </div>
        )}
        {success && <p className="success">{success}</p>}
      </section>

      {isModalOpen && typeof document !== 'undefined' && createPortal((
        <div className="estimativas-modal-overlay" role="presentation" onClick={closeModal}>
          <section
            ref={modalRef}
            className="estimativas-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="estimativas-modal__header">
              <h3>{isViewMode ? 'Visualizar Estimativa' : editingId ? 'Editar Estimativa' : 'Incluir Estimativa'}</h3>
              <button type="button" className="button-secondary" onClick={closeModal} disabled={isSaving}>
                Fechar
              </button>
            </div>

            <form className="estimativas-form" onSubmit={handleCreate}>
              <label>
                Codigo
                <input value={editingId ?? 'Gerado automaticamente'} disabled />
              </label>
              <label>
                Parceiro *
                <select value={form.partner} onChange={(event) => setFormValue('partner', event.target.value)} disabled={isViewMode}>
                  <option value="">Selecione um parceiro</option>
                  {PARTNER_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                  {form.partner && !PARTNER_OPTIONS.includes(form.partner as (typeof PARTNER_OPTIONS)[number]) && (
                    <option value={form.partner}>{form.partner}</option>
                  )}
                </select>
              </label>
              <label>
                Cliente *
                <input value={form.client} onChange={(event) => setFormValue('client', event.target.value)} readOnly={isViewMode} />
              </label>
              <label>
                Data *
                <input type="date" value={form.date} onChange={(event) => setFormValue('date', event.target.value)} disabled={isViewMode} />
              </label>
              <label>
                Demanda *
                <input value={form.demand} onChange={(event) => setFormValue('demand', event.target.value)} readOnly={isViewMode} />
              </label>
              <label>
                Status
                <select value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value as EstimateStatus }))} disabled={isViewMode}>
                  <option value="pending">Pendente</option>
                  <option value="sent">Enviado</option>
                </select>
              </label>
              <label className="estimativas-form__full">
                Observações
                <textarea rows={2} value={form.notes} onChange={(event) => setFormValue('notes', event.target.value)} readOnly={isViewMode} />
              </label>

              <div className="estimativas-form__full">
                <div className="estimativas-header-row">
                  <h4>Itens de detalhe e horas</h4>
                  <span className="muted"><strong>Total Horas:</strong> {formatHoursValue(modalTotalHours)}</span>
                  {!isViewMode && (
                    <button type="button" className="button-secondary" onClick={addFormItem}>Adicionar item</button>
                  )}
                </div>
                <div className="estimativas-table">
                  <table>
                    <thead>
                      <tr>
                        <th className="estimativas-col-index">#</th>
                        <th className="estimativas-col-detail">Detalhe</th>
                        <th className="estimativas-col-hours">Horas</th>
                        {!isViewMode && <th className="estimativas-col-actions">Acoes</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {form.items.map((item, index) => (
                        <tr key={`form-item-${index}`}>
                          <td className="estimativas-col-index">{index + 1}</td>
                          <td className="estimativas-col-detail">
                            <input
                              className="estimativas-input-detail"
                              value={item.detail}
                              onChange={(event) => setFormItemValue(index, 'detail', event.target.value)}
                              placeholder="Descreva o item"
                              readOnly={isViewMode}
                            />
                          </td>
                          <td className="estimativas-col-hours">
                            <input
                              className="estimativas-input-hours"
                              value={item.hours}
                              onChange={(event) => setFormItemValue(index, 'hours', event.target.value)}
                              placeholder="Ex: 2,5"
                              readOnly={isViewMode}
                            />
                          </td>
                          {!isViewMode && (
                            <td className="estimativas-col-actions">
                              <button type="button" onClick={() => removeFormItem(index)} disabled={form.items.length <= 1}>
                                Remover
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {!isViewMode && (
                <div className="estimativas-actions estimativas-form__full">
                  <button type="submit" className="button-primary" disabled={isSaving}>
                    {isSaving ? 'Salvando...' : editingId ? 'Atualizar' : 'Salvar'}
                  </button>
                </div>
              )}
            </form>
          </section>
        </div>
      ), document.body)}
    </div>
  )
}
