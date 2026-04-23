import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../lib/api'

export type CustomerHubPage = 'dashboard' | 'clientes' | 'contatos' | 'sistemas' | 'processos' | 'historico'

type ClienteStatus = 'Ativo' | 'Inativo' | 'Em Implantacao'
type ContatoTipo = 'Gestao' | 'Usuario' | 'Tecnico'

const CLIENTE_STATUS_LABEL: Record<ClienteStatus, string> = {
  Ativo: 'Ativo',
  Inativo: 'Inativo',
  'Em Implantacao': 'Em Implantação',
}

const CONTATO_TIPO_LABEL: Record<ContatoTipo, string> = {
  Gestao: 'Gestão',
  Usuario: 'Usuário',
  Tecnico: 'Técnico',
}

type Cliente = {
  id: string
  nome: string
  cnpj: string
  segmento: string
  cidade: string
  status: ClienteStatus
  parceiro: string
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
}

type Processo = {
  id: string
  clienteId: string
  nome: string
  descricao: string
  criadoEm: string
}

type Atividade = {
  id: string
  clienteId: string
  tipo: string
  descricao: string
  data: string
}

type ModalState<T> = { open: boolean; data: Partial<T> }

function emptyModal<T>(): ModalState<T> {
  return { open: false, data: {} }
}

// Convert API rows (numeric IDs) to frontend strings
function mapCliente(r: Record<string, unknown>): Cliente {
  return {
    id: String(r.id ?? ''),
    nome: String(r.nome ?? ''),
    cnpj: String(r.cnpj ?? ''),
    segmento: String(r.segmento ?? ''),
    cidade: String(r.cidade ?? ''),
    status: (r.status as ClienteStatus) ?? 'Ativo',
    parceiro: String(r.parceiro ?? ''),
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
    tipo: (r.tipo as ContatoTipo) ?? 'Usuario',
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
  }
}

function mapProcesso(r: Record<string, unknown>): Processo {
  return {
    id: String(r.id ?? ''),
    clienteId: String(r.clienteId ?? ''),
    nome: String(r.nome ?? ''),
    descricao: String(r.descricao ?? ''),
    criadoEm: String(r.criadoEm ?? ''),
  }
}

function mapAtividade(r: Record<string, unknown>): Atividade {
  return {
    id: String(r.id ?? ''),
    clienteId: String(r.clienteId ?? ''),
    tipo: String(r.tipo ?? ''),
    descricao: String(r.descricao ?? ''),
    data: String(r.data ?? ''),
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
        setClientes((data.clients ?? []).map(mapCliente))
        setContatos((data.contacts ?? []).map(mapContato))
        setSistemas((data.systems ?? []).map(mapSistema))
        setProcessos((data.processes ?? []).map(mapProcesso))
        setAtividades((data.activities ?? []).map(mapAtividade))
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
    const isEdit = !!d.id
    const url = isEdit ? apiUrl(`/api/customer-hub/clients/${d.id}`) : apiUrl('/api/customer-hub/clients')
    const method = isEdit ? 'PUT' : 'POST'
    try {
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
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
    if (!d.descricao?.trim() || !d.clienteId) return
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

  const filteredContatos = filterClienteId ? contatos.filter((c) => c.clienteId === filterClienteId) : contatos
  const filteredSistemas = filterClienteId ? sistemas.filter((s) => s.clienteId === filterClienteId) : sistemas
  const filteredProcessos = filterClienteId ? processos.filter((p) => p.clienteId === filterClienteId) : processos
  const filteredAtividades = filterClienteId ? atividades.filter((a) => a.clienteId === filterClienteId) : atividades

  // ── DASHBOARD ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return <div className="customer-hub"><p className="muted">Carregando...</p></div>
  }

  if (error) {
    return <div className="customer-hub"><p className="error-message">{error}</p></div>
  }

  if (subPage === 'dashboard') {
    return (
      <div className="customer-hub">
        <div className="ch-stats">
          {[
            { label: 'Total de Clientes', value: stats.totalClientes, sub: `${stats.ativos} ativos` },
            { label: 'Contatos', value: stats.totalContatos, sub: 'Cadastrados' },
            { label: 'Sistemas', value: stats.totalSistemas, sub: 'Implementados' },
            { label: 'Atividades', value: stats.totalAtividades, sub: 'Registradas' },
          ].map(({ label, value, sub }) => (
            <div key={label} className="card ch-stat-card">
              <p className="ch-stat-card__label">{label}</p>
              <p className="ch-stat-card__value">{value}</p>
              <p className="muted">{sub}</p>
            </div>
          ))}
        </div>

        <div className="grid">
          <section className="card">
            <h2>Clientes por Status</h2>
            <div className="ch-status-list">
              {[
                { label: 'Ativos', value: stats.ativos, color: 'var(--brand-600)' },
                { label: 'Inativos', value: stats.inativos, color: '#d97706' },
                { label: 'Em Implantação', value: stats.emImplantacao, color: '#3b82f6' },
              ].map(({ label, value, color }) => (
                <div key={label} className="ch-status-item">
                  <span className="ch-status-dot" style={{ background: color }} />
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <h2>Clientes por Segmento</h2>
            <div className="ch-status-list">
              {Array.from(new Set(clientes.map((c) => c.segmento))).map((seg) => (
                <div key={seg} className="ch-status-item">
                  <span>{seg}</span>
                  <strong>{clientes.filter((c) => c.segmento === seg).length}</strong>
                </div>
              ))}
              {clientes.length === 0 && <p className="muted">Nenhum cliente cadastrado.</p>}
            </div>
          </section>
        </div>

        <section className="card">
          <h2>Atividades Recentes</h2>
          {atividades.length === 0 ? (
            <p className="muted">Nenhuma atividade registrada.</p>
          ) : (
            <ul className="ch-activity-list">
              {[...atividades].reverse().slice(0, 10).map((a) => (
                <li key={a.id}>
                  <span className="muted">{a.data}</span>
                  <strong>{getClienteNome(a.clienteId)}</strong>
                  <span>{a.tipo}: {a.descricao}</span>
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
    const d = clienteModal.data
    return (
      <div className="customer-hub">
        {clienteModal.open && (
          <div className="ch-modal-overlay" onClick={() => setClienteModal(emptyModal())}>
            <div className="ch-modal" onClick={(e) => e.stopPropagation()}>
              <h2>{d.id ? 'Editar Cliente' : 'Novo Cliente'}</h2>
              <div className="ch-form">
                <label>
                  Razão Social *
                  <input value={d.nome ?? ''} onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, nome: e.target.value } }))} />
                </label>
                <label>
                  CNPJ
                  <input value={d.cnpj ?? ''} onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, cnpj: e.target.value } }))} />
                </label>
                <label>
                  Segmento
                  <input value={d.segmento ?? ''} onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, segmento: e.target.value } }))} />
                </label>
                <label>
                  Cidade / UF
                  <input value={d.cidade ?? ''} onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, cidade: e.target.value } }))} />
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
                  <input value={d.parceiro ?? ''} onChange={(e) => setClienteModal((m) => ({ ...m, data: { ...m.data, parceiro: e.target.value } }))} />
                </label>
              </div>
              <div className="ch-modal-actions">
                <button type="button" className="button-secondary" onClick={() => setClienteModal(emptyModal())}>Cancelar</button>
                <button type="button" className="button-primary" onClick={handleSaveCliente}>Salvar</button>
              </div>
            </div>
          </div>
        )}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>Clientes</h2>
              <p className="muted">Gerencie os clientes</p>
            </div>
            <button type="button" className="button-primary" onClick={() => setClienteModal({ open: true, data: { status: 'Ativo' } })}>
              + Novo Cliente
            </button>
          </div>
          <div className="csv-table">
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
                {clientes.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nome}</td>
                    <td>{c.cnpj}</td>
                    <td>{c.segmento}</td>
                    <td>{c.cidade}</td>
                    <td>
                      <span className={`ch-badge ch-badge--${c.status === 'Ativo' ? 'ativo' : c.status === 'Inativo' ? 'inativo' : 'implantacao'}`}>
                        {CLIENTE_STATUS_LABEL[c.status] ?? c.status}
                      </span>
                    </td>
                    <td>{c.parceiro}</td>
                    <td>
                      <div className="ch-row-actions">
                        <button type="button" className="button-secondary ch-action-btn" onClick={() => setClienteModal({ open: true, data: { ...c } })}>Editar</button>
                        <button type="button" className="button-secondary ch-action-btn ch-action-btn--danger" onClick={() => handleDeleteCliente(c.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {clientes.length === 0 && (
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
          <div className="ch-modal-overlay" onClick={() => setContatoModal(emptyModal())}>
            <div className="ch-modal" onClick={(e) => e.stopPropagation()}>
              <h2>{d.id ? 'Editar Contato' : 'Novo Contato'}</h2>
              <div className="ch-form">
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
                  <select value={d.tipo ?? 'Usuario'} onChange={(e) => setContatoModal((m) => ({ ...m, data: { ...m.data, tipo: e.target.value as ContatoTipo } }))}>
                    <option value="Gestao">Gestão</option>
                    <option value="Usuario">Usuário</option>
                    <option value="Tecnico">Técnico</option>
                  </select>
                </label>
              </div>
              <div className="ch-modal-actions">
                <button type="button" className="button-secondary" onClick={() => setContatoModal(emptyModal())}>Cancelar</button>
                <button type="button" className="button-primary" onClick={handleSaveContato}>Salvar</button>
              </div>
            </div>
          </div>
        )}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>Contatos</h2>
              <p className="muted">Gerencie os contatos dos clientes</p>
            </div>
            <div className="ch-header-actions">
              <select value={filterClienteId} onChange={(e) => setFilterClienteId(e.target.value)} className="ch-filter-select">
                <option value="">Todos os Clientes</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <button type="button" className="button-primary" onClick={() => setContatoModal({ open: true, data: { tipo: 'Usuario' } })}>
                + Novo Contato
              </button>
            </div>
          </div>
          <div className="csv-table">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Cliente</th>
                  <th>Cargo</th>
                  <th>E-mail / Telefone</th>
                  <th>Tipo</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredContatos.map((c) => (
                  <tr key={c.id}>
                    <td>{c.nome}</td>
                    <td>{getClienteNome(c.clienteId)}</td>
                    <td>{c.cargo}</td>
                    <td>
                      {c.email}
                      {c.telefone && <><br /><span className="muted">{c.telefone}</span></>}
                    </td>
                    <td>
                      <span className={`ch-badge ch-badge--tipo-${c.tipo.toLowerCase()}`}>{CONTATO_TIPO_LABEL[c.tipo] ?? c.tipo}</span>
                    </td>
                    <td>
                      <div className="ch-row-actions">
                        <button type="button" className="button-secondary ch-action-btn" onClick={() => handleDuplicateContato(c)}>Duplicar</button>
                        <button type="button" className="button-secondary ch-action-btn" onClick={() => setContatoModal({ open: true, data: { ...c } })}>Editar</button>
                        <button type="button" className="button-secondary ch-action-btn ch-action-btn--danger" onClick={() => handleDeleteContato(c.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredContatos.length === 0 && (
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
          <div className="ch-modal-overlay" onClick={() => setSistemaModal(emptyModal())}>
            <div className="ch-modal" onClick={(e) => e.stopPropagation()}>
              <h2>{d.id ? 'Editar Sistema' : 'Novo Sistema'}</h2>
              <div className="ch-form">
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
              </div>
              <div className="ch-modal-actions">
                <button type="button" className="button-secondary" onClick={() => setSistemaModal(emptyModal())}>Cancelar</button>
                <button type="button" className="button-primary" onClick={handleSaveSistema}>Salvar</button>
              </div>
            </div>
          </div>
        )}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>Sistemas e Produtos</h2>
              <p className="muted">Gerencie os sistemas implementados nos clientes</p>
            </div>
            <div className="ch-header-actions">
              <select value={filterClienteId} onChange={(e) => setFilterClienteId(e.target.value)} className="ch-filter-select">
                <option value="">Todos os Clientes</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <button type="button" className="button-primary" onClick={() => setSistemaModal({ open: true, data: {} })}>
                + Novo Sistema
              </button>
            </div>
          </div>
          <div className="csv-table">
            <table>
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Cliente</th>
                  <th>Módulo</th>
                  <th>Versão</th>
                  <th>Contato</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredSistemas.map((s) => (
                  <tr key={s.id}>
                    <td>{s.produto}</td>
                    <td>{getClienteNome(s.clienteId)}</td>
                    <td>{s.modulo}</td>
                    <td>{s.versao}</td>
                    <td>{getContatoNome(s.contatoId)}</td>
                    <td>
                      <div className="ch-row-actions">
                        <button type="button" className="button-secondary ch-action-btn" onClick={() => setSistemaModal({ open: true, data: { ...s } })}>Editar</button>
                        <button type="button" className="button-secondary ch-action-btn ch-action-btn--danger" onClick={() => handleDeleteSistema(s.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredSistemas.length === 0 && (
                  <tr><td colSpan={6} className="ch-empty">Nenhum sistema encontrado.</td></tr>
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
          <div className="ch-modal-overlay" onClick={() => setProcessoModal(emptyModal())}>
            <div className="ch-modal" onClick={(e) => e.stopPropagation()}>
              <h2>{d.id ? 'Editar Processo' : 'Novo Processo'}</h2>
              <div className="ch-form">
                <label>
                  Nome do Processo *
                  <input value={d.nome ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, nome: e.target.value } }))} />
                </label>
                <label>
                  Cliente *
                  <select value={d.clienteId ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, clienteId: e.target.value } }))}>
                    <option value="">Selecione...</option>
                    {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </select>
                </label>
                <label className="ch-form__full">
                  Descrição
                  <textarea rows={4} value={d.descricao ?? ''} onChange={(e) => setProcessoModal((m) => ({ ...m, data: { ...m.data, descricao: e.target.value } }))} />
                </label>
              </div>
              <div className="ch-modal-actions">
                <button type="button" className="button-secondary" onClick={() => setProcessoModal(emptyModal())}>Cancelar</button>
                <button type="button" className="button-primary" onClick={handleSaveProcesso}>Salvar</button>
              </div>
            </div>
          </div>
        )}

        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>Processos</h2>
              <p className="muted">Documente os processos de negócio dos clientes</p>
            </div>
            <div className="ch-header-actions">
              <select value={filterClienteId} onChange={(e) => setFilterClienteId(e.target.value)} className="ch-filter-select">
                <option value="">Todos os Clientes</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
              <button type="button" className="button-primary" onClick={() => setProcessoModal({ open: true, data: {} })}>
                + Novo Processo
              </button>
            </div>
          </div>
          <div className="csv-table">
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Cliente</th>
                  <th>Descrição</th>
                  <th>Data</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredProcessos.map((p) => (
                  <tr key={p.id}>
                    <td>{p.nome}</td>
                    <td>{getClienteNome(p.clienteId)}</td>
                    <td>{p.descricao}</td>
                    <td>{p.criadoEm}</td>
                    <td>
                      <div className="ch-row-actions">
                        <button type="button" className="button-secondary ch-action-btn" onClick={() => setProcessoModal({ open: true, data: { ...p } })}>Editar</button>
                        <button type="button" className="button-secondary ch-action-btn ch-action-btn--danger" onClick={() => handleDeleteProcesso(p.id)}>Excluir</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredProcessos.length === 0 && (
                  <tr><td colSpan={5} className="ch-empty">Nenhum processo encontrado.</td></tr>
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
        <div className="ch-modal-overlay" onClick={() => setAtividadeModal(emptyModal())}>
          <div className="ch-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{dAtiv.id ? 'Editar Atividade' : 'Nova Atividade'}</h2>
            <div className="ch-form">
              <label>
                Cliente *
                <select value={dAtiv.clienteId ?? ''} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, clienteId: e.target.value } }))}>
                  <option value="">Selecione...</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </label>
              <label>
                Tipo
                <select value={dAtiv.tipo ?? 'Atividade'} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, tipo: e.target.value } }))}>
                  <option>Atividade</option>
                  <option>Reunião</option>
                  <option>Suporte</option>
                  <option>Visita</option>
                  <option>E-mail</option>
                </select>
              </label>
              <label>
                Data
                <input type="date" value={dAtiv.data ?? new Date().toISOString().slice(0, 10)} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, data: e.target.value } }))} />
              </label>
              <label className="ch-form__full">
                Descrição *
                <textarea rows={4} value={dAtiv.descricao ?? ''} onChange={(e) => setAtividadeModal((m) => ({ ...m, data: { ...m.data, descricao: e.target.value } }))} />
              </label>
            </div>
            <div className="ch-modal-actions">
              <button type="button" className="button-secondary" onClick={() => setAtividadeModal(emptyModal())}>Cancelar</button>
              <button type="button" className="button-primary" onClick={handleSaveAtividade}>Salvar</button>
            </div>
          </div>
        </div>
      )}

      <section className="card">
        <div className="ch-section-header">
          <div>
            <h2>Histórico</h2>
            <p className="muted">Registre atividades e eventos dos clientes</p>
          </div>
          <div className="ch-header-actions">
            <select value={filterClienteId} onChange={(e) => setFilterClienteId(e.target.value)} className="ch-filter-select">
              <option value="">Todos os Clientes</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <button type="button" className="button-primary" onClick={() => setAtividadeModal({ open: true, data: { tipo: 'Atividade', data: new Date().toISOString().slice(0, 10) } })}>
              + Nova Atividade
            </button>
          </div>
        </div>
        <div className="csv-table">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Cliente</th>
                <th>Tipo</th>
                <th>Descrição</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredAtividades.map((a) => (
                <tr key={a.id}>
                  <td>{a.data}</td>
                  <td>{getClienteNome(a.clienteId)}</td>
                  <td>{a.tipo}</td>
                  <td>{a.descricao}</td>
                  <td>
                    <div className="ch-row-actions">
                      <button type="button" className="button-secondary ch-action-btn" onClick={() => setAtividadeModal({ open: true, data: { ...a } })}>Editar</button>
                      <button type="button" className="button-secondary ch-action-btn ch-action-btn--danger" onClick={() => handleDeleteAtividade(a.id)}>Excluir</button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredAtividades.length === 0 && (
                <tr><td colSpan={5} className="ch-empty">Nenhum registro encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
