import { useEffect, useState } from 'react'
import { apiUrl } from '../lib/api'

type HistoryEntry = {
  id: number
  acao: 'inclusao' | 'alteracao'
  ocorridoEm: string
  usuario: string
  usuarioNome: string
  alteracoes: Record<string, { anterior: unknown; novo: unknown }>
}

type AtendimentoHistoryTabProps = {
  atendimentoId: number | null
  currentUsername: string
  currentDisplayName: string
}

const FIELD_LABELS: Record<string, string> = {
  numero: 'Número', titulo: 'Título', data: 'Data', data_prevista: 'Data Prevista',
  data_conclusao: 'Data Conclusão', tipo: 'Tipo', cliente: 'Cliente',
  solicitante: 'Solicitante', descricao: 'Descrição', responsavel: 'Responsável',
  status: 'Status', observacoes: 'Observações',
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Aberto', in_progress: 'Em andamento', done: 'Concluído', cancelled: 'Cancelado',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeHistory(input: unknown): HistoryEntry[] {
  if (!isRecord(input) || !Array.isArray(input.items)) throw new Error('Resposta inválida do histórico.')
  return input.items.map((row: unknown) => {
    if (!isRecord(row) || typeof row.id !== 'number' || !Number.isSafeInteger(row.id) || row.id <= 0
        || (row.acao !== 'inclusao' && row.acao !== 'alteracao')
        || typeof row.ocorridoEm !== 'string' || !Number.isFinite(Date.parse(row.ocorridoEm))
        || typeof row.usuario !== 'string' || typeof row.usuarioNome !== 'string'
        || !isRecord(row.alteracoes)) {
      throw new Error('Registro inválido no histórico.')
    }
    const alteracoes: HistoryEntry['alteracoes'] = {}
    for (const [field, change] of Object.entries(row.alteracoes)) {
      if (!isRecord(change) || !('anterior' in change) || !('novo' in change)) {
        throw new Error('Alteração inválida no histórico.')
      }
      alteracoes[field] = { anterior: change.anterior, novo: change.novo }
    }
    return {
      id: row.id, acao: row.acao, ocorridoEm: row.ocorridoEm,
      usuario: row.usuario, usuarioNome: row.usuarioNome, alteracoes,
    }
  })
}

function formatValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value !== 'string') return JSON.stringify(value)
  if (field === 'status') return STATUS_LABELS[value] ?? value
  if (['data', 'data_prevista', 'data_conclusao'].includes(field) && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value.split('-').reverse().join('/')
  }
  if (field === 'descricao' || field === 'observacoes') {
    return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '-'
  }
  return value
}

export default function AtendimentoHistoryTab({ atendimentoId, currentUsername, currentDisplayName }: AtendimentoHistoryTabProps) {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [isLoading, setIsLoading] = useState(atendimentoId !== null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (atendimentoId === null) return
    const controller = new AbortController()
    const load = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const response = await fetch(apiUrl(`/api/central-servicos/atendimentos/${atendimentoId}/historico`), {
          headers: { 'x-user': currentUsername.trim(), 'x-user-display': currentDisplayName.trim() },
          signal: controller.signal,
        })
        const body: unknown = await response.json()
        if (!response.ok) {
          throw new Error(isRecord(body) && typeof body.error === 'string'
            ? body.error : 'Falha ao carregar histórico do atendimento.')
        }
        const history = normalizeHistory(body)
        if (!controller.signal.aborted) setEntries(history)
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar histórico do atendimento.')
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [atendimentoId, currentUsername, currentDisplayName, reload])

  if (atendimentoId === null) {
    return <p className="muted">Salve o atendimento para registrar a inclusão e consultar seu histórico.</p>
  }
  if (isLoading) return <p className="muted" role="status">Carregando histórico...</p>
  if (error) {
    return (
      <div>
        <p className="error" role="alert">{error}</p>
        <button type="button" className="button-secondary" onClick={() => setReload((value) => value + 1)}>Tentar novamente</button>
      </div>
    )
  }

  return (
    <div className="atendimento-history">
      <p className="muted">Histórico somente leitura. Alterações anteriores à implantação desta funcionalidade não são recuperadas.</p>
      {entries.length === 0 && <p className="muted">Nenhum histórico registrado para este atendimento.</p>}
      {entries.map((entry) => (
        <article key={entry.id} className="atendimento-history-entry">
          <h4>{entry.acao === 'inclusao' ? 'Inclusão' : 'Alteração'} por {entry.usuarioNome || entry.usuario}</h4>
          <p className="muted">
            <time dateTime={entry.ocorridoEm}>{new Date(entry.ocorridoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</time>
            {entry.usuarioNome && ` • ${entry.usuario}`}
          </p>
          <div className="estimativas-table ch-table-theme">
            <table>
              <thead><tr><th>Campo</th><th>Valor anterior</th><th>Novo valor</th></tr></thead>
              <tbody>
                {Object.entries(entry.alteracoes).map(([field, change]) => (
                  <tr key={field}>
                    <td>{FIELD_LABELS[field] ?? field}</td>
                    <td>{formatValue(field, change.anterior)}</td>
                    <td>{formatValue(field, change.novo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ))}
    </div>
  )
}
