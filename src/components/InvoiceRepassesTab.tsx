import { useEffect, useRef, useState } from 'react'
import { apiUrl } from '../lib/api'
import { confirmAction } from '../lib/confirmDialog'

type Repasse = {
  id: number | null
  recursoId: string
  recurso: string
  valor: string
  pagamentoId: number | null
  pagamentoStatus: 'Pendente' | 'Pago' | null
}

type ResourceOption = { id: number; nome: string; status: string }

type Props = {
  invoiceId: number | null
  readOnly: boolean
  invoiceHasChanges: boolean
  invoiceIsSaving: boolean
  onDirtyChange: (dirty: boolean) => void
  onBusyChange: (busy: boolean) => void
}

function normalizeRepasse(input: unknown): Repasse {
  if (!input || typeof input !== 'object') throw new Error('Resposta inválida dos repasses.')
  const row = input as Record<string, unknown>
  const id = Number(row.id)
  const recursoId = Number(row.recursoId)
  const valor = Number(row.valor)
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(recursoId) || recursoId <= 0 || !Number.isFinite(valor) || valor <= 0) {
    throw new Error('Resposta inválida dos repasses.')
  }
  const pagamentoId = row.pagamentoId == null ? null : Number(row.pagamentoId)
  const status = row.pagamentoStatus
  if (pagamentoId !== null && (!Number.isSafeInteger(pagamentoId) || pagamentoId <= 0 || (status !== 'Pendente' && status !== 'Pago'))) {
    throw new Error('Resposta inválida do pagamento vinculado ao repasse.')
  }
  return {
    id,
    recursoId: String(recursoId),
    recurso: String(row.recurso ?? ''),
    valor: valor.toFixed(2),
    pagamentoId,
    pagamentoStatus: status === 'Pendente' || status === 'Pago' ? status : null,
  }
}

async function requestItems(url: string, options?: RequestInit): Promise<unknown[]> {
  const response = await fetch(apiUrl(url), options)
  const payload = await response.json() as { items?: unknown[]; error?: string }
  if (!response.ok) throw new Error(payload.error || 'Falha na operação de repasses.')
  if (!Array.isArray(payload.items)) throw new Error('Resposta inválida da API.')
  return payload.items
}

export default function InvoiceRepassesTab({
  invoiceId, readOnly, invoiceHasChanges, invoiceIsSaving, onDirtyChange, onBusyChange,
}: Props) {
  const [items, setItems] = useState<Repasse[]>([])
  const [savedItems, setSavedItems] = useState<Repasse[]>([])
  const [resources, setResources] = useState<ResourceOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const previousInvoiceId = useRef(invoiceId)
  const dirty = JSON.stringify(items) !== JSON.stringify(savedItems)

  useEffect(() => { onDirtyChange(dirty) }, [dirty, onDirtyChange])
  useEffect(() => { onBusyChange(isSaving) }, [isSaving, onBusyChange])

  useEffect(() => {
    const controller = new AbortController()
    const preserveDraft = previousInvoiceId.current === null && invoiceId !== null
    previousInvoiceId.current = invoiceId
    const load = async () => {
      setIsLoading(true)
      setLoadFailed(false)
      setError(null)
      setSuccess(null)
      try {
        const [repasses, rawResources] = await Promise.all([
          invoiceId === null ? Promise.resolve([]) : requestItems(`/api/central-servicos/faturamentos/${invoiceId}/repasses`, { signal: controller.signal }),
          requestItems('/api/central-servicos/recursos', { signal: controller.signal }),
        ])
        const normalized = repasses.map(normalizeRepasse)
        const options = rawResources.map((input) => {
          const resource = input as Partial<ResourceOption>
          if (!resource || !Number.isSafeInteger(resource.id) || !resource.nome) throw new Error('Resposta inválida do cadastro de recursos.')
          return { id: Number(resource.id), nome: String(resource.nome), status: String(resource.status ?? '') }
        }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        if (!controller.signal.aborted) {
          if (!preserveDraft) setItems(normalized)
          setSavedItems(normalized)
          setResources(options)
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setLoadFailed(true)
          setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar repasses.')
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [invoiceId, reloadKey])

  const handleOperation = async (confirm: boolean) => {
    if (invoiceId === null || isSaving || readOnly) return
    if (confirm && (dirty || invoiceHasChanges)) {
      setError('Salve os repasses e os dados do faturamento antes de confirmar.')
      return
    }
    if (confirm && !await confirmAction('Confirmar os repasses e cadastrar os pagamentos Pendentes?')) return
    setIsSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const url = `/api/central-servicos/faturamentos/${invoiceId}/repasses${confirm ? '/confirmar' : ''}`
      const rows = await requestItems(url, {
        method: confirm ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        ...(!confirm ? { body: JSON.stringify({ items: items.map((item) => ({ id: item.id, recursoId: item.recursoId, valor: item.valor })) }) } : {}),
      })
      const normalized = rows.map(normalizeRepasse)
      setItems(normalized)
      setSavedItems(normalized)
      setSuccess(confirm ? 'Repasses confirmados. Pagamentos cadastrados sem duplicidades.' : 'Repasses salvos. Pagamentos Pendentes vinculados foram sincronizados.')
    } catch (operationError) {
      setError(operationError instanceof Error ? operationError.message : 'Falha ao processar repasses.')
    } finally {
      setIsSaving(false)
    }
  }

  const disabled = readOnly || isLoading || isSaving || invoiceIsSaving || loadFailed
  const updateItem = (index: number, field: 'recursoId' | 'valor', value: string) => {
    setItems((prev) => prev.map((item, position) => position === index ? { ...item, [field]: value } : item))
    setSuccess(null)
  }
  const total = items.reduce((sum, item) => sum + (Number(item.valor.replace(',', '.')) || 0), 0)
  const hasUnconfirmed = items.some((item) => item.pagamentoId === null)

  return (
    <div className="estimativas-form__full invoice-repasses">
      <p className="muted">Salve os repasses e confirme para gerar pagamentos Pendentes. Alterações em repasses confirmados sincronizam os pagamentos Pendentes; pagamentos Pagos não podem ser alterados ou removidos por esta aba.</p>
      {invoiceId === null && <p className="muted">Clique em Adicionar repasse para selecionar os recursos e informar os valores. Cadastre o faturamento para habilitar Salvar repasses e Confirmar repasses; os valores digitados serão mantidos.</p>}
          {invoiceHasChanges && <p className="muted">A confirmação utiliza os dados já salvos do faturamento. Salve as alterações do faturamento antes de confirmar.</p>}
          {isLoading && <p className="muted">Carregando repasses...</p>}
          <div className="csv-table ch-table-theme">
            <table>
              <thead><tr><th>Recurso</th><th>Valor de repasse</th><th>Pagamento</th><th>Ações</th></tr></thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id ?? `novo-${index}`}>
                    <td>
                      <select aria-label={`Recurso do repasse ${index + 1}`} value={item.recursoId} disabled={disabled || item.pagamentoStatus === 'Pago'} onChange={(event) => updateItem(index, 'recursoId', event.target.value)}>
                        <option value="">Selecione o recurso</option>
                        {!resources.some((resource) => String(resource.id) === item.recursoId) && item.recursoId && <option value={item.recursoId}>{item.recurso || `Recurso #${item.recursoId}`}</option>}
                        {resources.filter((resource) => resource.status === 'Ativo' || String(resource.id) === item.recursoId).map((resource) => <option key={resource.id} value={resource.id}>{resource.nome}{resource.status !== 'Ativo' ? ` (${resource.status})` : ''}</option>)}
                      </select>
                    </td>
                    <td><input type="text" inputMode="decimal" placeholder="0,00" aria-label={`Valor do repasse ${index + 1}`} value={item.valor} disabled={disabled || item.pagamentoStatus === 'Pago'} onChange={(event) => updateItem(index, 'valor', event.target.value)} /></td>
                    <td>{item.pagamentoId === null ? 'Não confirmado' : `#${item.pagamentoId} - ${item.pagamentoStatus}`}</td>
                    <td>{!readOnly && <button type="button" className="button-secondary" disabled={disabled || item.pagamentoStatus === 'Pago'} onClick={async () => {
                      if (item.pagamentoId !== null && !await confirmAction('Remover este repasse e excluir seu pagamento Pendente ao salvar?')) return
                      setItems((prev) => prev.filter((_, position) => position !== index))
                      setSuccess(null)
                    }}>Remover</button>}</td>
                  </tr>
                ))}
                {!items.length && !isLoading && <tr><td colSpan={4}>Nenhum repasse cadastrado.</td></tr>}
              </tbody>
              <tfoot><tr><td>Total</td><td>{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</td><td colSpan={2} /></tr></tfoot>
            </table>
          </div>
          <div className="invoice-repasses-actions">
            <div className="invoice-repasses-actions__group">
              {!readOnly && <button type="button" className="button-secondary" disabled={disabled || items.length >= 100} onClick={() => setItems((prev) => [...prev, { id: null, recursoId: '', recurso: '', valor: '', pagamentoId: null, pagamentoStatus: null }])}>Adicionar repasse</button>}
              <button type="button" className="button-secondary" disabled={isSaving || isLoading || invoiceIsSaving} onClick={async () => {
                if (dirty && !await confirmAction('Descartar alterações dos repasses e recarregar?')) return
                setReloadKey((prev) => prev + 1)
              }}>Atualizar repasses</button>
            </div>
            {!readOnly && (
              <div className="invoice-repasses-actions__group">
                <button type="button" className="button-secondary" disabled={disabled || invoiceId === null || !dirty} onClick={() => { void handleOperation(false) }}>Salvar repasses</button>
                <button type="button" className="button-primary" disabled={disabled || invoiceId === null || dirty || invoiceHasChanges || !hasUnconfirmed} onClick={() => { void handleOperation(true) }}>Confirmar repasses</button>
              </div>
            )}
          </div>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}
    </div>
  )
}
