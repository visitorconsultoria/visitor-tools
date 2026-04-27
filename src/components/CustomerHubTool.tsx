import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiUrl } from '../lib/api'

export type CustomerHubPage = 'dashboard' | 'clientes' | 'contatos' | 'sistemas' | 'processos' | 'historico'

type ClienteStatus = 'Ativo' | 'Inativo' | 'Em Implantacao'
type ClienteFonte = 'interno' | 'totvs' | 'outros'
type ContatoTipo = 'comercial' | 'servicos' | 'tecnico' | 'usuario' | 'gestao' | 'outros'

const CLIENTE_STATUS_LABEL: Record<ClienteStatus, string> = {
  Ativo: 'Ativo',
  Inativo: 'Inativo',
  'Em Implantacao': 'Em Implantação',
}

const CONTATO_TIPO_LABEL: Record<ContatoTipo, string> = {
  comercial: 'Comercial',
  servicos: 'Serviços',
  tecnico: 'Técnico',
  usuario: 'Usuário',
  gestao: 'Gestão',
  outros: 'Outros',
}

const CLIENTE_FONTE_LABEL: Record<ClienteFonte, string> = {
  interno: 'Interno',
  totvs: 'Totvs',
  outros: 'Outros',
}

type Cliente = {
  id: string
  nome: string
  cnpj: string
  segmento: string
  cidade: string
  status: ClienteStatus
  parceiro: string
  dataInicio: string
  fonte: ClienteFonte
}

type Contato = {
  id: string
  nome: string
  clienteId: string
  cargo: string
  departamento: string
  email: string
  telefone: string
  tipo: ContatoTipo
}

type Sistema = {
  id: string
  produto: string
  clienteId: string
  modulo: string
  versao: string
  contatoId: string
  integracoes: string
  responsavel: string
  observacoes: string
}

type Processo = {
  id: string
  clienteId: string
  nome: string
  descricao: string
  criadoEm: string
  sistemaNome: string
  modulo: string
  responsavel: string
  detalhamento: string
  observacoes: string
  periodicidade: string
  criticidade: string
}

type Atividade = {
  id: string
  clienteId: string
  tipo: string
  descricao: string
  data: string
  evento: string
  sistemaNome: string
  modulo: string
  responsavel: string
  processoNome: string
  observacoes: string
}

type ModalState<T> = { open: boolean; data: Partial<T> }

function emptyModal<T>(): ModalState<T> {
  return { open: false, data: {} }
}

function normalizeCnpjDigits(value: string, padTo14 = false): string {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 14)
  if (!padTo14 || digits.length >= 14) return digits
  return digits.length >= 13 ? digits.padStart(14, '0') : digits
}

function formatCnpj(value: string, padTo14 = false): string {
  const digits = normalizeCnpjDigits(value, padTo14)
  if (!digits) return ''

  if (digits.length <= 2) return digits
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
}

// Convert API rows (numeric IDs) to frontend strings
function mapCliente(r: Record<string, unknown>): Cliente {
  return {
    id: String(r.id ?? ''),
    nome: String(r.nome ?? ''),
    cnpj: formatCnpj(String(r.cnpj ?? ''), true),
    segmento: String(r.segmento ?? ''),
    cidade: String(r.cidade ?? ''),
    status: (r.status as ClienteStatus) ?? 'Ativo',
    parceiro: String(r.parceiro ?? ''),
    dataInicio: String(r.dataInicio ?? ''),
    fonte: (r.fonte as ClienteFonte) ?? 'interno',
  }
}

function mapContato(r: Record<string, unknown>): Contato {
  return {
    id: String(r.id ?? ''),
    nome: String(r.nome ?? ''),
    clienteId: String(r.clienteId ?? ''),
    cargo: String(r.cargo ?? ''),
    departamento: String(r.departamento ?? ''),
    email: String(r.email ?? ''),
    telefone: String(r.telefone ?? ''),
    tipo: (r.tipo as ContatoTipo) ?? 'comercial',
  }
}

function mapSistema(r: Record<string, unknown>): Sistema {
  return {
    id: String(r.id ?? ''),
    produto: String(r.produto ?? ''),
    clienteId: String(r.clienteId ?? ''),
    modulo: String(r.modulo ?? ''),
    versao: String(r.versao ?? ''),
    contatoId: r.contatoId == null ? '' : String(r.contatoId),
    integracoes: String(r.integracoes ?? ''),
    responsavel: String(r.responsavel ?? ''),
    observacoes: String(r.observacoes ?? ''),
  }
}

function mapProcesso(r: Record<string, unknown>): Processo {
  return {
    id: String(r.id ?? ''),
    clienteId: String(r.clienteId ?? ''),
    nome: String(r.nome ?? ''),
    descricao: String(r.descricao ?? ''),
    criadoEm: String(r.criadoEm ?? ''),
    sistemaNome: String(r.sistemaNome ?? ''),
    modulo: String(r.modulo ?? ''),
    responsavel: String(r.responsavel ?? ''),
    detalhamento: String(r.detalhamento ?? ''),
    observacoes: String(r.observacoes ?? ''),
    periodicidade: String(r.periodicidade ?? 'mensal'),
    criticidade: String(r.criticidade ?? 'media'),
  }
}

function mapAtividade(r: Record<string, unknown>): Atividade {
  return {
    id: String(r.id ?? ''),
    clienteId: String(r.clienteId ?? ''),
    tipo: String(r.tipo ?? ''),
    descricao: String(r.descricao ?? ''),
    data: String(r.data ?? ''),
    evento: String(r.evento ?? ''),
    sistemaNome: String(r.sistemaNome ?? ''),
    modulo: String(r.modulo ?? ''),
    responsavel: String(r.responsavel ?? ''),
    processoNome: String(r.processoNome ?? ''),
    observacoes: String(r.observacoes ?? ''),
  }
}

export default function CustomerHubTool({ subPage }: { subPage: CustomerHubPage }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [contatos, setContatos] = useState<Contato[]>([])
  const [sistemas, setSistemas] = useState<Sistema[]>([])
  const [processos, setProcessos] = useState<Processo[]>([])
  const [atividades, setAtividades] = useState<Atividade[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [clienteModal, setClienteModal] = useState<ModalState<Cliente>>(emptyModal())
  const [contatoModal, setContatoModal] = useState<ModalState<Contato>>(emptyModal())
  const [sistemaModal, setSistemaModal] = useState<ModalState<Sistema>>(emptyModal())
  const [processoModal, setProcessoModal] = useState<ModalState<Processo>>(emptyModal())
  const [atividadeModal, setAtividadeModal] = useState<ModalState<Atividade>>(emptyModal())

  const [filterClienteId, setFilterClienteId] = useState('')
  const [clienteSearch, setClienteSearch] = useState('')
  const [contatoSearch, setContatoSearch] = useState('')
  const [sistemaSearch, setSistemaSearch] = useState('')
  const [processoSearch, setProcessoSearch] = useState('')
  const [atividadeSearch, setAtividadeSearch] = useState('')

  // Bootstrap: load all data on mount
  useEffect(() => {
    setIsLoading(true)
    setError(null)
    fetch(apiUrl('/api/customer-hub/bootstrap'))
      .then((res) => {
        if (!res.ok) return res.json().then((b) => Promise.reject(new Error(b.error ?? `HTTP ${res.status}`)))
        return res.json()
      })
      .then((data) => {
        const clients = data.clients ?? data.clientes ?? []
        const contacts = data.contacts ?? data.contatos ?? []
        const systems = data.systems ?? data.sistemas ?? []
        const processes = data.processes ?? data.processos ?? []
        const activities = data.activities ?? data.atividades ?? []

        setClientes(clients.map(mapCliente))
        setContatos(contacts.map(mapContato))
        setSistemas(systems.map(mapSistema))
        setProcessos(processes.map(mapProcesso))
        setAtividades(activities.map(mapAtividade))
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Erro ao carregar dados.'))
      .finally(() => setIsLoading(false))
  }, [])

  const getClienteNome = (id: string) => clientes.find((c) => c.id === id)?.nome ?? '-'
  const getContatoNome = (id: string) => contatos.find((c) => c.id === id)?.nome ?? '-'

  const stats = useMemo(() => ({
    totalClientes: clientes.length,
    ativos: clientes.filter((c) => c.status === 'Ativo').length,
    inativos: clientes.filter((c) => c.status === 'Inativo').length,
    emImplantacao: clientes.filter((c) => c.status === 'Em Implantacao').length,
    totalContatos: contatos.length,
    totalSistemas: sistemas.length,
    totalAtividades: atividades.length,
  }), [clientes, contatos, sistemas, atividades])

  // CRUD — Clientes
  const handleSaveCliente = async () => {
    const d = clienteModal.data
    if (!d.nome?.trim()) return
    const cnpjDigits = normalizeCnpjDigits(String(d.cnpj ?? ''))
    if (cnpjDigits.length > 0 && cnpjDigits.length !== 14) {
      alert('CNPJ invalido. Informe 14 digitos.')
      return
    }
    const isEdit = !!d.id
    const url = isEdit ? apiUrl(`/api/customer-hub/clients/${d.id}`) : apiUrl('/api/customer-hub/clients')
    const method = isEdit ? 'PUT' : 'POST'
    const payload = {
      ...d,
      cnpj: normalizeCnpjDigits(String(d.cnpj ?? '')),
    }
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      const saved = mapCliente(body.item as Record<string, unknown>)
      setClientes((prev) => isEdit ? prev.map((c) => c.id === saved.id ? saved : c) : [...prev, saved])
      setClienteModal(emptyModal())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar cliente.')
    }
  }

  const handleDeleteCliente = async (id: string) => {
    if (!window.confirm('Excluir este cliente e todos os registros vinculados?')) return
    try {
      const res = await fetch(apiUrl(`/api/customer-hub/clients/${id}`), { method: 'DELETE' })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? `HTTP ${res.status}`) }
      setClientes((prev) => prev.filter((c) => c.id !== id))
      setContatos((prev) => prev.filter((c) => c.clienteId !== id))
      setSistemas((prev) => prev.filter((s) => s.clienteId !== id))
      setProcessos((prev) => prev.filter((p) => p.clienteId !== id))
      setAtividades((prev) => prev.filter((a) => a.clienteId !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir cliente.')
    }
  }

  // CRUD — Contatos
  const handleSaveContato = async () => {
    const d = contatoModal.data
    if (!d.nome?.trim() || !d.clienteId) return
    const isEdit = !!d.id
    const url = isEdit ? apiUrl(`/api/customer-hub/contacts/${d.id}`) : apiUrl('/api/customer-hub/contacts')
    const method = isEdit ? 'PUT' : 'POST'
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      const saved = mapContato(body.item as Record<string, unknown>)
      setContatos((prev) => isEdit ? prev.map((c) => c.id === saved.id ? saved : c) : [...prev, saved])
      setContatoModal(emptyModal())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar contato.')
    }
  }

  const handleDuplicateContato = async (c: Contato) => {
    const payload = { ...c, id: undefined, nome: `${c.nome} (cópia)` }
    try {
      const res = await fetch(apiUrl('/api/customer-hub/contacts'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setContatos((prev) => [...prev, mapContato(body.item as Record<string, unknown>)])
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao duplicar contato.')
    }
  }

  const handleDeleteContato = async (id: string) => {
    if (!window.confirm('Excluir este contato?')) return
    try {
      const res = await fetch(apiUrl(`/api/customer-hub/contacts/${id}`), { method: 'DELETE' })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? `HTTP ${res.status}`) }
      setContatos((prev) => prev.filter((c) => c.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir contato.')
    }
  }

  // CRUD — Sistemas
  const handleSaveSistema = async () => {
    const d = sistemaModal.data
    if (!d.produto?.trim() || !d.clienteId) return
    const isEdit = !!d.id
    const url = isEdit ? apiUrl(`/api/customer-hub/systems/${d.id}`) : apiUrl('/api/customer-hub/systems')
    const method = isEdit ? 'PUT' : 'POST'
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      const saved = mapSistema(body.item as Record<string, unknown>)
      setSistemas((prev) => isEdit ? prev.map((s) => s.id === saved.id ? saved : s) : [...prev, saved])
      setSistemaModal(emptyModal())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar sistema.')
    }
  }

  const handleDeleteSistema = async (id: string) => {
    if (!window.confirm('Excluir este sistema?')) return
    try {
      const res = await fetch(apiUrl(`/api/customer-hub/systems/${id}`), { method: 'DELETE' })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? `HTTP ${res.status}`) }
      setSistemas((prev) => prev.filter((s) => s.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir sistema.')
    }
  }

  // CRUD — Processos
  const handleSaveProcesso = async () => {
    const d = processoModal.data
    if (!d.nome?.trim() || !d.clienteId) return
    const isEdit = !!d.id
    const url = isEdit ? apiUrl(`/api/customer-hub/processes/${d.id}`) : apiUrl('/api/customer-hub/processes')
    const method = isEdit ? 'PUT' : 'POST'
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      const saved = mapProcesso(body.item as Record<string, unknown>)
      setProcessos((prev) => isEdit ? prev.map((p) => p.id === saved.id ? saved : p) : [...prev, saved])
      setProcessoModal(emptyModal())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar processo.')
    }
  }

  const handleDeleteProcesso = async (id: string) => {
    if (!window.confirm('Excluir este processo?')) return
    try {
      const res = await fetch(apiUrl(`/api/customer-hub/processes/${id}`), { method: 'DELETE' })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? `HTTP ${res.status}`) }
      setProcessos((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir processo.')
    }
  }

  // CRUD — Histórico
  const handleSaveAtividade = async () => {
    const d = atividadeModal.data
    if (!d.clienteId) return
    const isEdit = !!d.id
    const url = isEdit ? apiUrl(`/api/customer-hub/activities/${d.id}`) : apiUrl('/api/customer-hub/activities')
    const method = isEdit ? 'PUT' : 'POST'
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      const saved = mapAtividade(body.item as Record<string, unknown>)
      setAtividades((prev) => isEdit ? prev.map((a) => a.id === saved.id ? saved : a) : [...prev, saved])
      setAtividadeModal(emptyModal())
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao salvar atividade.')
    }
  }

  const handleDeleteAtividade = async (id: string) => {
    if (!window.confirm('Excluir esta atividade?')) return
    try {
      const res = await fetch(apiUrl(`/api/customer-hub/activities/${id}`), { method: 'DELETE' })
      if (!res.ok) { const b = await res.json(); throw new Error(b.error ?? `HTTP ${res.status}`) }
      setAtividades((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao excluir atividade.')
    }
  }

  const filteredClientes = clientes.filter((c) => {
    const term = clienteSearch.trim().toLowerCase()
    if (!term) return true

    const haystack = [
      c.nome,
      c.cnpj,
      c.segmento,
      c.cidade,
      CLIENTE_FONTE_LABEL[c.fonte] ?? c.fonte,
      CLIENTE_STATUS_LABEL[c.status] ?? c.status,
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(term)
  })

  const filteredContatos = filterClienteId ? contatos.filter((c) => c.clienteId === filterClienteId) : contatos
  const filteredContatosView = filteredContatos.filter((c) => {
    const term = contatoSearch.trim().toLowerCase()
    if (!term) return true

    const clienteNome = getClienteNome(c.clienteId).toLowerCase()
    const haystack = [
      c.nome,
      c.email,
      c.telefone,
      c.cargo,
      c.departamento,
      clienteNome,
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(term)
  })
  const filteredSistemas = filterClienteId ? sistemas.filter((s) => s.clienteId === filterClienteId) : sistemas
  const filteredSistemasView = filteredSistemas.filter((s) => {
    const term = sistemaSearch.trim().toLowerCase()
    if (!term) return true

    const haystack = [
      s.produto,
      getClienteNome(s.clienteId),
      s.modulo,
      s.versao,
      s.integracoes,
      s.responsavel || getContatoNome(s.contatoId),
      s.observacoes,
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(term)
  })

  const filteredProcessos = filterClienteId ? processos.filter((p) => p.clienteId === filterClienteId) : processos
  const filteredProcessosView = filteredProcessos.filter((p) => {
    const term = processoSearch.trim().toLowerCase()
    if (!term) return true

    const haystack = [
      p.nome,
      getClienteNome(p.clienteId),
      p.sistemaNome,
      p.modulo,
      p.periodicidade,
      p.criticidade,
      p.responsavel,
      p.detalhamento,
      p.observacoes,
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(term)
  })

  const filteredAtividades = filterClienteId ? atividades.filter((a) => a.clienteId === filterClienteId) : atividades
  const filteredAtividadesView = filteredAtividades.filter((a) => {
    const term = atividadeSearch.trim().toLowerCase()
    if (!term) return true

    const haystack = [
      a.data,
      getClienteNome(a.clienteId),
      a.evento || a.tipo,
      a.sistemaNome,
      a.modulo,
      a.responsavel,
      a.observacoes,
      a.descricao,
      a.processoNome,
    ]
      .join(' ')
      .toLowerCase()

    return haystack.includes(term)
  })

  const renderClienteModal = () => {
    const d = clienteModal.data
    const isEdit = Boolean(d.id)
    const cnpjDigits = normalizeCnpjDigits(String(d.cnpj ?? ''))
    const hasCnpjError = cnpjDigits.length > 0 && cnpjDigits.length !== 14

    return (
      createPortal(
        <div className="estimativas-modal-overlay" role="presentation" onClick={() => setClienteModal(emptyModal())}>
          <section className="estimativas-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="estimativas-modal__header">
              <h3>{isEdit ? 'Editar Cliente' : 'Novo Cliente'}</h3>
              <button type="button" className="button-secondary" onClick={() => setClienteModal(emptyModal())}>Fechar</button>
            </div>
            <form className="estimativas-form" onSubmit={(e) => { e.preventDefault(); void handleSaveCliente() }}>
              <label className="estimativas-form__full">
                Nome da Empresa *
                <input value={d.nome ?? ''} onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, nome: e.target.value } }))} />
              </label>
              <label>
                CNPJ
                <input
                  className={hasCnpjError ? 'ch-input-error' : ''}
                  value={d.cnpj ?? ''}
                  placeholder="00.000.000/0001-00"
                  onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, cnpj: formatCnpj(e.target.value) } }))}
                />
                {hasCnpjError && <span className="ch-field-error">CNPJ deve conter 14 dígitos.</span>}
              </label>
              <label>
                Segmento
                <input value={d.segmento ?? ''} placeholder="Ex: Indústria, Varejo" onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, segmento: e.target.value } }))} />
              </label>
              <label>
                Localização
                <input value={d.cidade ?? ''} placeholder="Cidade, Estado" onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, cidade: e.target.value } }))} />
              </label>
              <label>
                Data de Início
                <input type="date" value={d.dataInicio ?? ''} onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, dataInicio: e.target.value } }))} />
              </label>
              <label>
                Status
                <select value={d.status ?? 'Ativo'} onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, status: e.target.value as ClienteStatus } }))}>
                  <option value="Ativo">Ativo</option>
                  <option value="Inativo">Inativo</option>
                  <option value="Em Implantacao">Em Implantação</option>
                </select>
              </label>
              <label>
                Parceiro
                <select value={d.fonte ?? 'interno'} onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, fonte: e.target.value as ClienteFonte } }))}>
                  <option value="interno">Interno</option>
                  <option value="totvs">Totvs</option>
                  <option value="outros">Outros</option>
                </select>
              </label>
              <div className="estimativas-actions estimativas-form__full">
                <button type="submit" className="button-primary" disabled={hasCnpjError}>{isEdit ? 'Salvar' : 'Cadastrar'}</button>
              </div>
            </form>
          </section>
        </div>,
        document.body
      )
    )
  }

  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return <div className="customer-hub"><p className="muted">Carregando...</p></div>
  }

  if (error) {
    return <div className="customer-hub"><p className="error-message">{error}</p></div>
  }

  if (subPage === 'dashboard') {
    const statusItems = [
      { label: 'Ativos', value: stats.ativos, color: '#16a34a' },
      { label: 'Inativos', value: stats.inativos, color: '#647c76' },
      { label: 'Em Implantação', value: stats.emImplantacao, color: '#f59e0b' },
    ]

    const totalStatus = statusItems.reduce((acc, item) => acc + item.value, 0)
    let statusCursor = 0
    const statusGradient = totalStatus
      ? `conic-gradient(${statusItems
        .map((item) => {
          const start = (statusCursor / totalStatus) * 360
          statusCursor += item.value
          const end = (statusCursor / totalStatus) * 360
          return `${item.color} ${start}deg ${end}deg`
        })
        .join(', ')})`
      : 'conic-gradient(#d6e4df 0deg 360deg)'

    const segmentEntries = Array.from(
      clientes.reduce((acc, cliente) => {
        const key = String(cliente.segmento || 'Sem Segmento').trim() || 'Sem Segmento'
        acc.set(key, (acc.get(key) || 0) + 1)
        return acc
      }, new Map<string, number>()).entries(),
    ).sort((a, b) => b[1] - a[1])

    const maxSegmentValue = Math.max(1, ...segmentEntries.map(([, count]) => count))
    const recentActivities = [...atividades]
      .sort((a, b) => String(b.data).localeCompare(String(a.data)))
      .slice(0, 8)

    return (
      <div className="customer-hub">
        {clienteModal.open && renderClienteModal()}

        <header className="ch-dashboard-header">
          <div>
            <h2>Dashboard</h2>
            <p className="muted">Visão geral da gestão de clientes</p>
          </div>
          <button type="button" className="button-primary" onClick={() => setClienteModal({ open: true, data: { status: 'Ativo', fonte: 'interno' } })}>
            + Novo Cliente
          </button>
        </header>

        <div className="ch-stats">
          {[
            { label: 'Total de Clientes', value: stats.totalClientes, sub: `${stats.ativos} ativos`, icon: 'clients' },
            { label: 'Contatos', value: stats.totalContatos, sub: 'Cadastrados', icon: 'contacts' },
            { label: 'Sistemas', value: stats.totalSistemas, sub: 'Implementados', icon: 'systems' },
            { label: 'Atividades', value: stats.totalAtividades, sub: 'Registradas', icon: 'activities' },
          ].map(({ label, value, sub, icon }) => (
            <div key={label} className="card ch-stat-card">
              <div className="ch-stat-card__top">
                <p className="ch-stat-card__label">{label}</p>
                <span className="ch-stat-card__icon" aria-hidden="true">
                  {icon === 'clients' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>
                  )}
                  {icon === 'contacts' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="9" r="3" /><path d="M4 18c0-2.4 2-4 5-4s5 1.6 5 4" /><circle cx="17" cy="8" r="2" /><path d="M15 15c1.8 0 3 .9 3 2.5" /></svg>
                  )}
                  {icon === 'systems' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M9 20h6M12 17v3" /></svg>
                  )}
                  {icon === 'activities' && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-3.3-6.9" /><path d="M21 3v6h-6" /><path d="M12 7v5l3 2" /></svg>
                  )}
                </span>
              </div>
              <p className="ch-stat-card__value">{value}</p>
              <p className="muted ch-stat-card__sub">{sub}</p>
            </div>
          ))}
        </div>

        <div className="ch-dashboard-grid">
          <section className="card ch-chart-card">
            <h2>Clientes por Status</h2>
            <div className="ch-status-chart-wrap">
              <div className="ch-status-donut" style={{ background: statusGradient }}>
                <div className="ch-status-donut__hole" />
              </div>
              <div className="ch-status-legend">
                {statusItems.map((item) => (
                  <div key={item.label} className="ch-status-legend-item">
                    <span className="ch-status-dot" style={{ background: item.color }} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="card ch-chart-card">
            <h2>Clientes por Segmento</h2>
            <div className="ch-segment-chart">
              {segmentEntries.map(([segmento, total]) => (
                <div key={segmento} className="ch-segment-row">
                  <div className="ch-segment-label">{segmento}</div>
                  <div className="ch-segment-bar-track">
                    <div className="ch-segment-bar" style={{ width: `${(total / maxSegmentValue) * 100}%` }} />
                  </div>
                </div>
              ))}
              {segmentEntries.length === 0 && <p className="muted">Nenhum cliente cadastrado.</p>}
              {segmentEntries.length > 0 && (
                <div className="ch-segment-axis" aria-hidden="true">
                  <span>0</span>
                  <span>0.25</span>
                  <span>0.5</span>
                  <span>0.75</span>
                  <span>1</span>
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="card ch-recent-card">
          <h2>
            <span className="ch-recent-title-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
            </span>
            Atividades Recentes
          </h2>
          {recentActivities.length === 0 ? (
            <p className="muted">Nenhuma atividade registrada.</p>
          ) : (
            <ul className="ch-activity-list">
              {recentActivities.map((a) => (
                <li key={a.id}>
                  <span className="muted">{a.data}</span>
                  <strong>{getClienteNome(a.clienteId)}</strong>
                  <span>{(a.evento || a.tipo)}{a.observacoes || a.descricao ? ': ' + (a.observacoes || a.descricao) : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    )
  }

  // ── CLIENTES ───────────────────────────────────────────────────────────────
  if (subPage === 'clientes') {
    return (
      <div className="customer-hub">
        {clienteModal.open && renderClienteModal()}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>Clientes</h2>
              <p className="muted">Gerencie os clientes</p>
            </div>
            <button type="button" className="button-primary" onClick={() => setClienteModal({ open: true, data: { status: 'Ativo', fonte: 'interno' } })}>
              + Novo Cliente
            </button>
          </div>
          <div className="ch-table-toolbar ch-table-toolbar--single">
            <label className="ch-table-search">
              <span className="ch-table-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              </span>
              <input
                type="search"
                value={clienteSearch}
                onChange={(e) => setClienteSearch(e.target.value)}
                placeholder="Buscar por nome, CNPJ, segmento, cidade ou parceiro..."
                aria-label="Buscar cliente"
              />
            </label>
          </div>
          <div className="csv-table ch-table-theme">
            <table>
              <thead>
                <tr>
                  <th>Razão Social</th>
                  <th>CNPJ</th>
                  <th>Segmento</th>
                  <th>Cidade / UF</th>
                  <th>Status</th>
                  <th>Parceiro</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredClientes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nome}</td>
                    <td>{formatCnpj(c.cnpj, true)}</td>
                    <td>{c.segmento}</td>
                    <td>{c.cidade}</td>
                    <td>
                      <span className={`ch-badge ch-badge--${c.status === 'Ativo' ? 'ativo' : c.status === 'Inativo' ? 'inativo' : 'implantacao'}`}>
                        {CLIENTE_STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </td>
                    <td>{CLIENTE_FONTE_LABEL[c.fonte] ?? c.fonte}</td>
                    <td>
                      <div className="ch-row-actions ch-row-actions--icons">
                        <button type="button" className="ch-icon-action" aria-label="Editar cliente" title="Editar" onClick={() => setClienteModal({ open: true, data: { ...c } })}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir cliente" title="Excluir" onClick={() => handleDeleteCliente(c.id)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredClientes.length === 0 && (
                  <tr><td colSpan={7} className="ch-empty">Nenhum cliente cadastrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  // ── CONTATOS ───────────────────────────────────────────────────────────────
  if (subPage === 'contatos') {
    const d = contatoModal.data
    return (
      <div className="customer-hub">
        {contatoModal.open && (
          createPortal(
            <div className="estimativas-modal-overlay" role="presentation" onClick={() => setContatoModal(emptyModal())}>
              <section className="estimativas-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className="estimativas-modal__header">
                  <h3>{d.id ? 'Editar Contato' : 'Novo Contato'}</h3>
                  <button type="button" className="button-secondary" onClick={() => setContatoModal(emptyModal())}>Fechar</button>
                </div>
                <form className="estimativas-form" onSubmit={(e) => { e.preventDefault(); void handleSaveContato() }}>
                  <label>
                    Nome *
                    <input value={d.nome ?? ''} onChange={(e) => setContatoModal((m) => ({ ...m, data: { ...m.data, nome: e.target.value } }))} />
                  </label>
                  <label>
                    Cliente *
                    <select value={d.clienteId ?? ''} onChange={(e) => setContatoModal((m) => ({ ...m, data: { ...m.data, clienteId: e.target.value } }))}>
                      <option value="">Selecione...</option>
                      {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </label>
                  <label>
                    Cargo
                    <input value={d.cargo ?? ''} onChange={(e) => setContatoModal((m) => ({ ...m, data: { ...m.data, cargo: e.target.value } }))} />
                  </label>
                  <label>
                    Departamento
                    <input value={d.departamento ?? ''} onChange={(e) => setContatoModal((m) => ({ ...m, data: { ...m.data, departamento: e.target.value } }))} />
                  </label>
                  <label>
                    E-mail
                    <input type="email" value={d.email ?? ''} onChange={(e) => setContatoModal((m) => ({ ...m, data: { ...m.data, email: e.target.value } }))} />
                  </label>
                  <label>
                    Telefone
                    <input value={d.telefone ?? ''} onChange={(e) => setContatoModal((m) => ({ ...m, data: { ...m.data, telefone: e.target.value } }))} />
                  </label>
                  <label>
                    Tipo
                    <select value={d.tipo ?? 'comercial'} onChange={(e) => setContatoModal((m) => ({ ...m, data: { ...m.data, tipo: e.target.value as ContatoTipo } }))}>
                      <option value="comercial">Comercial</option>
                      <option value="servicos">Serviços</option>
                      <option value="tecnico">Técnico</option>
                      <option value="usuario">Usuário</option>
                      <option value="gestao">Gestão</option>
                      <option value="outros">Outros</option>
                    </select>
                  </label>
                  <div className="estimativas-actions estimativas-form__full">
                    <button type="submit" className="button-primary">Salvar</button>
                  </div>
                </form>
              </section>
            </div>,
            document.body
          )
        )}

        <section className="card ch-contacts-card">
          <div className="ch-section-header">
            <div>
              <h2>Contatos</h2>
              <p className="muted">Gerencie os contatos dos clientes</p>
            </div>
            <div className="ch-header-actions">
              <button type="button" className="button-primary" onClick={() => setContatoModal({ open: true, data: { tipo: 'comercial' } })}>
                + Novo Contato
              </button>
            </div>
          </div>

          <div className="ch-contacts-toolbar">
            <label className="ch-contacts-search">
              <span className="ch-contacts-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              </span>
              <input
                type="search"
                value={contatoSearch}
                onChange={(e) => setContatoSearch(e.target.value)}
                placeholder="Buscar por nome, email ou empresa..."
                aria-label="Buscar contato"
              />
            </label>
            <select value={filterClienteId} onChange={(e) => setFilterClienteId(e.target.value)} className="ch-filter-select">
              <option value="">Todos os Clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>

          <div className="csv-table ch-contacts-table ch-table-theme">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Cliente</th>
                  <th>Cargo / Departamento</th>
                  <th>Contato</th>
                  <th>Tipo</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredContatosView.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nome}</td>
                    <td>
                      <span className="ch-client-pill">{getClienteNome(c.clienteId)}</span>
                    </td>
                    <td>
                      <div className="ch-contact-stacked">
                        <span>{c.cargo || '-'}</span>
                        <span className="muted">{c.departamento || '-'}</span>
                      </div>
                    </td>
                    <td>
                      <div className="ch-contact-stacked">
                        <span className="ch-contact-line">
                          <span className="ch-contact-line__icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16v12H4z" /><path d="M4 7l8 6 8-6" /></svg>
                          </span>
                          {c.email || '-'}
                        </span>
                        <span className="ch-contact-line muted">
                          <span className="ch-contact-line__icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7 12.8 12.8 0 0 0 .7 2.8 2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6.2 6.2l1.2-1.2a2 2 0 0 1 2.1-.5 12.8 12.8 0 0 0 2.8.7A2 2 0 0 1 22 16.9z" /></svg>
                          </span>
                          {c.telefone || '-'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`ch-badge ch-badge--tipo-${c.tipo.toLowerCase()}`}>{CONTATO_TIPO_LABEL[c.tipo] ?? c.tipo}</span>
                    </td>
                    <td>
                      <div className="ch-row-actions ch-row-actions--icons">
                        <button type="button" className="ch-icon-action" aria-label="Duplicar contato" title="Duplicar" onClick={() => handleDuplicateContato(c)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                        </button>
                        <button type="button" className="ch-icon-action" aria-label="Editar contato" title="Editar" onClick={() => setContatoModal({ open: true, data: { ...c } })}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir contato" title="Excluir" onClick={() => handleDeleteContato(c.id)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredContatosView.length === 0 && (
                  <tr><td colSpan={6} className="ch-empty">Nenhum contato encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  // ── SISTEMAS ───────────────────────────────────────────────────────────────
  if (subPage === 'sistemas') {
    const d = sistemaModal.data
    return (
      <div className="customer-hub">
        {sistemaModal.open && (
          createPortal(
            <div className="estimativas-modal-overlay" role="presentation" onClick={() => setSistemaModal(emptyModal())}>
              <section className="estimativas-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className="estimativas-modal__header">
                  <h3>{d.id ? 'Editar Sistema' : 'Novo Sistema'}</h3>
                  <button type="button" className="button-secondary" onClick={() => setSistemaModal(emptyModal())}>Fechar</button>
                </div>
                <form className="estimativas-form" onSubmit={(e) => { e.preventDefault(); void handleSaveSistema() }}>
                  <label>
                    Produto / Sistema *
                    <input value={d.produto ?? ''} onChange={(e) => setSistemaModal((m) => ({ ...m, data: { ...m.data, produto: e.target.value } }))} />
                  </label>
                  <label>
                    Cliente *
                    <select value={d.clienteId ?? ''} onChange={(e) => setSistemaModal((m) => ({ ...m, data: { ...m.data, clienteId: e.target.value, contatoId: '' } }))}>
                      <option value="">Selecione...</option>
                      {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </label>
                  <label>
                    Módulo
                    <input value={d.modulo ?? ''} onChange={(e) => setSistemaModal((m) => ({ ...m, data: { ...m.data, modulo: e.target.value } }))} />
                  </label>
                  <label>
                    Versão
                    <input value={d.versao ?? ''} onChange={(e) => setSistemaModal((m) => ({ ...m, data: { ...m.data, versao: e.target.value } }))} />
                  </label>
                  <label>
                    Contato Responsável
                    <select value={d.contatoId ?? ''} onChange={(e) => setSistemaModal((m) => ({ ...m, data: { ...m.data, contatoId: e.target.value } }))}>
                      <option value="">Selecione...</option>
                      {contatos.filter((c) => !d.clienteId || c.clienteId === d.clienteId).map((c) => (
                        <option key={c.id} value={c.id}>{c.nome}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Integrações
                    <input value={d.integracoes ?? ''} placeholder="Ex: E-commerce, BI, WMS" onChange={(e) => setSistemaModal((m) => ({ ...m, data: { ...m.data, integracoes: e.target.value } }))} />
                  </label>
                  <label>
                    Responsável (nome)
                    <input value={d.responsavel ?? ''} onChange={(e) => setSistemaModal((m) => ({ ...m, data: { ...m.data, responsavel: e.target.value } }))} />
                  </label>
                  <label className="estimativas-form__full">
                    Observações
                    <textarea rows={3} value={d.observacoes ?? ''} onChange={(e) => setSistemaModal((m) => ({ ...m, data: { ...m.data, observacoes: e.target.value } }))} />
                  </label>
                  <div className="estimativas-actions estimativas-form__full">
                    <button type="submit" className="button-primary">Salvar</button>
                  </div>
                </form>
              </section>
            </div>,
            document.body
          )
        )}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>Sistemas e Produtos</h2>
              <p className="muted">Gerencie os sistemas implementados nos clientes</p>
            </div>
            <div className="ch-header-actions">
              <button type="button" className="button-primary" onClick={() => setSistemaModal({ open: true, data: {} })}>
                + Novo Sistema
              </button>
            </div>
          </div>
          <div className="ch-table-toolbar">
            <label className="ch-table-search">
              <span className="ch-table-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              </span>
              <input
                type="search"
                value={sistemaSearch}
                onChange={(e) => setSistemaSearch(e.target.value)}
                placeholder="Buscar por produto, cliente, modulo, versao ou responsavel..."
                aria-label="Buscar sistema"
              />
            </label>
            <select value={filterClienteId} onChange={(e) => setFilterClienteId(e.target.value)} className="ch-filter-select">
              <option value="">Todos os Clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="csv-table ch-table-theme">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Cliente</th>
                  <th>Módulo</th>
                  <th>Versão</th>
                  <th>Integrações</th>
                  <th>Responsável</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredSistemasView.map((s) => (
                  <tr key={s.id}>
                    <td>{s.produto}</td>
                    <td>{getClienteNome(s.clienteId)}</td>
                    <td>{s.modulo}</td>
                    <td>{s.versao}</td>
                    <td>{s.integracoes}</td>
                    <td>{s.responsavel || getContatoNome(s.contatoId)}</td>
                    <td>
                      <div className="ch-row-actions ch-row-actions--icons">
                        <button type="button" className="ch-icon-action" aria-label="Editar sistema" title="Editar" onClick={() => setSistemaModal({ open: true, data: { ...s } })}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir sistema" title="Excluir" onClick={() => handleDeleteSistema(s.id)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSistemasView.length === 0 && (
                  <tr><td colSpan={7} className="ch-empty">Nenhum sistema encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  // ── PROCESSOS ──────────────────────────────────────────────────────────────
  if (subPage === 'processos') {
    const d = processoModal.data
    return (
      <div className="customer-hub">
        {processoModal.open && (
          createPortal(
            <div className="estimativas-modal-overlay" role="presentation" onClick={() => setProcessoModal(emptyModal())}>
              <section className="estimativas-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
                <div className="estimativas-modal__header">
                  <h3>{d.id ? 'Editar Processo' : 'Novo Processo'}</h3>
                  <button type="button" className="button-secondary" onClick={() => setProcessoModal(emptyModal())}>Fechar</button>
                </div>
                <form className="estimativas-form" onSubmit={(e) => { e.preventDefault(); void handleSaveProcesso() }}>
                  <label>
                    Nome do Processo *
                    <input value={d.nome ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, nome: e.target.value } }))} />
                  </label>
                  <label>
                    Cliente *
                    <select value={d.clienteId ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, clienteId: e.target.value, sistemaNome: '', modulo: '', responsavel: '' } }))}>
                      <option value="">Selecione...</option>
                      {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                  </label>
                  <label>
                    Sistema
                    <input value={d.sistemaNome ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, sistemaNome: e.target.value } }))} />
                  </label>
                  <label>
                    Módulo
                    <input value={d.modulo ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, modulo: e.target.value } }))} />
                  </label>
                  <label>
                    Responsável
                    <select value={d.responsavel ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, responsavel: e.target.value } }))}>
                      <option value="">Selecione...</option>
                      {contatos.filter((c) => !d.clienteId || c.clienteId === d.clienteId).map((c) => (
                        <option key={c.id} value={c.nome}>{c.nome}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Periodicidade
                    <select value={d.periodicidade ?? 'mensal'} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, periodicidade: e.target.value } }))}>
                      <option value="diario">Diário</option>
                      <option value="semanal">Semanal</option>
                      <option value="quinzenal">Quinzenal</option>
                      <option value="mensal">Mensal</option>
                      <option value="semestral">Semestral</option>
                      <option value="anual">Anual</option>
                      <option value="sazonal">Sazonal</option>
                    </select>
                  </label>
                  <label>
                    Criticidade
                    <select value={d.criticidade ?? 'media'} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, criticidade: e.target.value } }))}>
                      <option value="baixa">Baixa</option>
                      <option value="media">Média</option>
                      <option value="alta">Alta</option>
                    </select>
                  </label>
                  <label className="estimativas-form__full">
                    Detalhamento
                    <textarea rows={4} value={d.detalhamento ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, detalhamento: e.target.value } }))} />
                  </label>
                  <label className="estimativas-form__full">
                    Observações
                    <textarea rows={3} value={d.observacoes ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, observacoes: e.target.value } }))} />
                  </label>
                  <div className="estimativas-actions estimativas-form__full">
                    <button type="submit" className="button-primary">Salvar</button>
                  </div>
                </form>
              </section>
            </div>,
            document.body
          )
        )}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>Processos</h2>
              <p className="muted">Documente os processos de negócio dos clientes</p>
            </div>
            <div className="ch-header-actions">
              <button type="button" className="button-primary" onClick={() => setProcessoModal({ open: true, data: {} })}>
                + Novo Processo
              </button>
            </div>
          </div>
          <div className="ch-table-toolbar">
            <label className="ch-table-search">
              <span className="ch-table-search__icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
              </span>
              <input
                type="search"
                value={processoSearch}
                onChange={(e) => setProcessoSearch(e.target.value)}
                placeholder="Buscar por processo, cliente, sistema, periodicidade ou criticidade..."
                aria-label="Buscar processo"
              />
            </label>
            <select value={filterClienteId} onChange={(e) => setFilterClienteId(e.target.value)} className="ch-filter-select">
              <option value="">Todos os Clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="csv-table ch-table-theme">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Cliente</th>
                  <th>Sistema</th>
                  <th>Módulo</th>
                  <th>Periodicidade</th>
                  <th>Criticidade</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredProcessosView.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nome}</td>
                    <td>{getClienteNome(p.clienteId)}</td>
                    <td>{p.sistemaNome}</td>
                    <td>{p.modulo}</td>
                    <td>{p.periodicidade}</td>
                    <td>
                      <span className={`ch-badge ch-badge--criticidade-${p.criticidade}`}>{p.criticidade}</span>
                    </td>
                    <td>
                      <div className="ch-row-actions ch-row-actions--icons">
                        <button type="button" className="ch-icon-action" aria-label="Editar processo" title="Editar" onClick={() => setProcessoModal({ open: true, data: { ...p } })}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir processo" title="Excluir" onClick={() => handleDeleteProcesso(p.id)}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredProcessosView.length === 0 && (
                  <tr><td colSpan={7} className="ch-empty">Nenhum processo encontrado.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  // ── HISTÓRICO ──────────────────────────────────────────────────────────────
  // subPage === 'historico'
  const dAtiv = atividadeModal.data
  return (
    <div className="customer-hub">
      {atividadeModal.open && (
        createPortal(
          <div className="estimativas-modal-overlay" role="presentation" onClick={() => setAtividadeModal(emptyModal())}>
            <section className="estimativas-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
              <div className="estimativas-modal__header">
                <h3>{dAtiv.id ? 'Editar Atividade' : 'Nova Atividade'}</h3>
                <button type="button" className="button-secondary" onClick={() => setAtividadeModal(emptyModal())}>Fechar</button>
              </div>
              <form className="estimativas-form" onSubmit={(e) => { e.preventDefault(); void handleSaveAtividade() }}>
                <label>
                  Cliente *
                  <select value={dAtiv.clienteId ?? ''} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, clienteId: e.target.value, sistemaNome: '', modulo: '', responsavel: '', processoNome: '' } }))}>
                    <option value="">Selecione...</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </label>
                <label>
                  Data
                  <input type="date" value={dAtiv.data ?? new Date().toISOString().slice(0, 10)} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, data: e.target.value } }))} />
                </label>
                <label>
                  Evento *
                  <input value={dAtiv.evento ?? ''} placeholder="Ex: Treinamento, Atualização, Suporte" onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, evento: e.target.value } }))} />
                </label>
                <label>
                  Sistema
                  <input value={dAtiv.sistemaNome ?? ''} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, sistemaNome: e.target.value } }))} />
                </label>
                <label>
                  Módulo
                  <input value={dAtiv.modulo ?? ''} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, modulo: e.target.value } }))} />
                </label>
                <label>
                  Responsável
                  <select value={dAtiv.responsavel ?? ''} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, responsavel: e.target.value } }))}>
                    <option value="">Selecione...</option>
                    {contatos.filter((c) => !dAtiv.clienteId || c.clienteId === dAtiv.clienteId).map((c) => (
                      <option key={c.id} value={c.nome}>{c.nome}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Processo
                  <select value={dAtiv.processoNome ?? ''} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, processoNome: e.target.value } }))}>
                    <option value="">Selecione...</option>
                    {processos.filter((p) => !dAtiv.clienteId || p.clienteId === dAtiv.clienteId).map((p) => (
                      <option key={p.id} value={p.nome}>{p.nome}</option>
                    ))}
                  </select>
                </label>
                <label className="estimativas-form__full">
                  Observações
                  <textarea rows={4} value={dAtiv.observacoes ?? ''} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, observacoes: e.target.value } }))} />
                </label>
                <div className="estimativas-actions estimativas-form__full">
                  <button type="submit" className="button-primary">Salvar</button>
                </div>
              </form>
            </section>
          </div>,
          document.body
        )
      )}

      <section className="card">
        <div className="ch-section-header">
          <div>
            <h2>Histórico</h2>
            <p className="muted">Registre atividades e eventos dos clientes</p>
          </div>
          <div className="ch-header-actions">
            <button type="button" className="button-primary" onClick={() => setAtividadeModal({ open: true, data: { data: new Date().toISOString().slice(0, 10) } })}>
              + Nova Atividade
            </button>
          </div>
        </div>
        <div className="ch-table-toolbar">
          <label className="ch-table-search">
            <span className="ch-table-search__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
            </span>
            <input
              type="search"
              value={atividadeSearch}
              onChange={(e) => setAtividadeSearch(e.target.value)}
              placeholder="Buscar por data, cliente, evento, sistema ou responsavel..."
              aria-label="Buscar atividade"
            />
          </label>
          <select value={filterClienteId} onChange={(e) => setFilterClienteId(e.target.value)} className="ch-filter-select">
            <option value="">Todos os Clientes</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div className="csv-table ch-table-theme">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Evento</th>
                <th>Sistema</th>
                <th>Responsável</th>
                <th>Observações</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredAtividadesView.map((a) => (
                <tr key={a.id}>
                  <td>{a.data}</td>
                  <td>{getClienteNome(a.clienteId)}</td>
                  <td>{a.evento || a.tipo}</td>
                  <td>{a.sistemaNome}{a.modulo ? ` / ${a.modulo}` : ''}</td>
                  <td>{a.responsavel}</td>
                  <td>{a.observacoes || a.descricao}</td>
                  <td>
                    <div className="ch-row-actions ch-row-actions--icons">
                      <button type="button" className="ch-icon-action" aria-label="Editar atividade" title="Editar" onClick={() => setAtividadeModal({ open: true, data: { ...a } })}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir atividade" title="Excluir" onClick={() => handleDeleteAtividade(a.id)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAtividadesView.length === 0 && (
                <tr><td colSpan={7} className="ch-empty">Nenhum registro encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
