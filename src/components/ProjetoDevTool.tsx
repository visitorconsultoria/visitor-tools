import { useEffect, useMemo, useState, type FormEvent } from 'react'
import * as XLSX from 'xlsx'
import { apiUrl } from '../lib/api'

type ProjectItemType = 'cadastro' | 'processo' | 'relatorio' | 'formula' | 'dicionario' | 'workflow' | 'outros'
type ProjectItemComplexity = 'baixa' | 'media' | 'alta'

type ProjectGridItem = {
  id: number
  module: string
  type: ProjectItemType
  description: string
  complexity: ProjectItemComplexity
  notes: string
}

type Project = {
  id: number
  client: string
  date: string
  description: string
  items: ProjectGridItem[]
}

type ProjectForm = {
  client: string
  date: string
  description: string
}

type ProjectItemForm = {
  module: string
  type: ProjectItemType
  description: string
  complexity: ProjectItemComplexity
  notes: string
}

type ProjectScreenMode = 'overview' | 'workspace' | 'items'

const EMPTY_PROJECT_FORM: ProjectForm = {
  client: '',
  date: '',
  description: '',
}

const EMPTY_ITEM_FORM: ProjectItemForm = {
  module: '',
  type: 'cadastro',
  description: '',
  complexity: 'baixa',
  notes: '',
}

const ITEM_TYPE_LABELS: Record<ProjectItemType, string> = {
  cadastro: 'Cadastro',
  processo: 'Processo',
  relatorio: 'Relatório',
  formula: 'Fórmula',
  dicionario: 'Dicionário',
  workflow: 'Workflow',
  outros: 'Outros',
}

const COMPLEXITY_LABELS: Record<ProjectItemComplexity, string> = {
  baixa: 'Baixa',
  media: 'Media',
  alta: 'Alta',
}

const ITEM_TYPE_BADGE_CLASS: Record<ProjectItemType, string> = {
  cadastro: 'projeto-dev__badge--type-cadastro',
  processo: 'projeto-dev__badge--type-processo',
  relatorio: 'projeto-dev__badge--type-relatorio',
  formula: 'projeto-dev__badge--type-formula',
  dicionario: 'projeto-dev__badge--type-dicionario',
  workflow: 'projeto-dev__badge--type-workflow',
  outros: 'projeto-dev__badge--type-outros',
}

const ITEM_COMPLEXITY_BADGE_CLASS: Record<ProjectItemComplexity, string> = {
  baixa: 'projeto-dev__badge--complexity-baixa',
  media: 'projeto-dev__badge--complexity-media',
  alta: 'projeto-dev__badge--complexity-alta',
}

function normalizeProjectItem(input: unknown): ProjectGridItem | null {
  const item = input as Partial<ProjectGridItem>
  const id = Number(item.id)
  const module = String(item.module ?? '').trim()
  const description = String(item.description ?? '').trim()
  const notes = String(item.notes ?? '')

  const type = String(item.type ?? '') as ProjectItemType
  const complexity = String(item.complexity ?? '') as ProjectItemComplexity

  const validType = ['cadastro', 'processo', 'relatrio', 'formula', 'dicionario', 'workflow', 'outros'].includes(type)
  const validComplexity = ['baixa', 'media', 'alta'].includes(complexity)

  if (!Number.isFinite(id) || id <= 0 || !module || !description || !validType || !validComplexity) {
    return null
  }

  return {
    id,
    module,
    type,
    description,
    complexity,
    notes,
  }
}

function normalizeProject(input: unknown): Project | null {
  const project = input as Partial<Project>
  const id = Number(project.id)
  const client = String(project.client ?? '').trim()
  const date = String(project.date ?? '').trim()
  const description = String(project.description ?? '').trim()

  if (!Number.isFinite(id) || id <= 0 || !client || !date || !description) {
    return null
  }

  const items = Array.isArray(project.items)
    ? project.items.map(normalizeProjectItem).filter((item): item is ProjectGridItem => Boolean(item))
    : []

  return {
    id,
    client,
    date,
    description,
    items,
  }
}

function formatProjectDate(date: string): string {
  const value = date.trim()
  if (!value) return '-'

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    const [, year, month, day] = isoMatch
    return `${day}/${month}/${year}`
  }

  const slashMatch = value.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  if (slashMatch) {
    const [, year, month, day] = slashMatch
    return `${day}/${month}/${year}`
  }

  return value
}

export default function ProjetoDevTool() {
  const [currentScreen, setCurrentScreen] = useState<ProjectScreenMode>('overview')
  const [projects, setProjects] = useState<Project[]>([])
  const [projectSearch, setProjectSearch] = useState('')
  const [itemSearch, setItemSearch] = useState('')
  const [projectForm, setProjectForm] = useState<ProjectForm>(EMPTY_PROJECT_FORM)
  const [editingProjectId, setEditingProjectId] = useState<number | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null)
  const [itemForm, setItemForm] = useState<ProjectItemForm>(EMPTY_ITEM_FORM)
  const [editingItemId, setEditingItemId] = useState<number | null>(null)
  const [detailItem, setDetailItem] = useState<ProjectGridItem | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const fetchProjects = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await fetch(apiUrl('/api/projeto-dev/projects'))
      if (!response.ok) {
        let detail = 'Falha ao carregar projetos.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      const data = await response.json() as { items?: unknown[] }
      const nextItems = Array.isArray(data.items)
        ? data.items.map(normalizeProject).filter((item): item is Project => Boolean(item))
        : []
      setProjects(nextItems)
    } catch (loadError) {
      const detail = loadError instanceof Error ? loadError.message : 'Falha ao carregar projetos.'
      setError(detail)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchProjects()
  }, [])

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  )

  const filteredProjects = useMemo(() => {
    const term = projectSearch.trim().toLowerCase()
    if (!term) return projects

    return projects.filter((project) => (
      project.client.toLowerCase().includes(term)
      || project.description.toLowerCase().includes(term)
      || project.date.toLowerCase().includes(term)
    ))
  }, [projectSearch, projects])

  const filteredProjectItems = useMemo(() => {
    if (!selectedProject) return []
    const term = itemSearch.trim().toLowerCase()
    if (!term) return selectedProject.items

    return selectedProject.items.filter((item) => (
      item.module.toLowerCase().includes(term)
      || item.description.toLowerCase().includes(term)
      || item.notes.toLowerCase().includes(term)
      || ITEM_TYPE_LABELS[item.type].toLowerCase().includes(term)
      || COMPLEXITY_LABELS[item.complexity].toLowerCase().includes(term)
    ))
  }, [itemSearch, selectedProject])

  const resetProjectForm = () => {
    setProjectForm(EMPTY_PROJECT_FORM)
    setEditingProjectId(null)
  }

  const resetItemForm = () => {
    setItemForm(EMPTY_ITEM_FORM)
    setEditingItemId(null)
  }

  const selectProjectForForm = (project: Project) => {
    setProjectForm({
      client: project.client,
      date: project.date,
      description: project.description,
    })
    setEditingProjectId(project.id)
    setSelectedProjectId(project.id)
  }

  const closeItemsModal = () => {
    setItemSearch('')
    resetItemForm()
  }

  const openWorkspace = (projectId?: number | null) => {
    if (typeof projectId === 'number') {
      setSelectedProjectId(projectId)
    }
    setCurrentScreen('workspace')
  }

  const goToOverview = () => {
    setCurrentScreen('overview')
  }

  const openItemsScreen = (project: Project) => {
    setSelectedProjectId(project.id)
    setCurrentScreen('items')
    setItemSearch('')
    resetItemForm()
    setError(null)
    setSuccess(null)
  }

  const handleSaveProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const client = projectForm.client.trim()
    const date = projectForm.date.trim()
    const description = projectForm.description.trim()

    if (!client || !date || !description) {
      setError('Preencha cliente, data e Descrição do projeto.')
      return
    }

    setIsSaving(true)
    try {
      const url = editingProjectId
        ? apiUrl(`/api/projeto-dev/projects/${editingProjectId}`)
        : apiUrl('/api/projeto-dev/projects')
      const method = editingProjectId ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, date, description }),
      })

      if (!response.ok) {
        let detail = 'Falha ao salvar projeto.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      await fetchProjects()
      resetProjectForm()
      setSuccess(editingProjectId ? 'Projeto atualizado com sucesso.' : 'Projeto cadastrado com sucesso.')
    } catch (saveError) {
      const detail = saveError instanceof Error ? saveError.message : 'Falha ao salvar projeto.'
      setError(detail)
    } finally {
      setIsSaving(false)
    }
  }

  const handleEditProject = (project: Project) => {
    selectProjectForForm(project)
    setCurrentScreen('workspace')
    setError(null)
    setSuccess(null)
  }

  const handleOpenProjectItems = (project: Project) => {
    openItemsScreen(project)
  }

  const handleDeleteProject = async (projectId: number) => {
    setError(null)
    setSuccess(null)
    setIsSaving(true)
    try {
      const response = await fetch(apiUrl(`/api/projeto-dev/projects/${projectId}`), { method: 'DELETE' })
      if (!response.ok) {
        let detail = 'Falha ao excluir projeto.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      if (selectedProjectId === projectId) closeItemsModal()
      if (editingProjectId === projectId) resetProjectForm()
      await fetchProjects()
      setSuccess('Projeto removido com sucesso.')
    } catch (deleteError) {
      const detail = deleteError instanceof Error ? deleteError.message : 'Falha ao excluir projeto.'
      setError(detail)
    } finally {
      setIsSaving(false)
    }
  }

  const handleSaveItem = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedProject) return

    setError(null)
    setSuccess(null)

    const module = itemForm.module.trim()
    const description = itemForm.description.trim()

    if (!module || !description) {
      setError('Preencha modulo e Descrição do item do projeto.')
      return
    }

    setIsSaving(true)
    try {
      const url = editingItemId
        ? apiUrl(`/api/projeto-dev/projects/${selectedProject.id}/items/${editingItemId}`)
        : apiUrl(`/api/projeto-dev/projects/${selectedProject.id}/items`)
      const method = editingItemId ? 'PUT' : 'POST'

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module,
          type: itemForm.type,
          description,
          complexity: itemForm.complexity,
          notes: itemForm.notes.trim(),
        }),
      })

      if (!response.ok) {
        let detail = 'Falha ao salvar item.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      const data = await response.json() as { item?: unknown }
      const updatedProject = normalizeProject(data.item)
      if (updatedProject) {
        setProjects((prev) => prev.map((project) => (project.id === updatedProject.id ? updatedProject : project)))
      } else {
        await fetchProjects()
      }
      setSuccess(editingItemId ? 'Item atualizado com sucesso.' : 'Item incluido com sucesso.')
      resetItemForm()
    } catch (saveError) {
      const detail = saveError instanceof Error ? saveError.message : 'Falha ao salvar item.'
      setError(detail)
    } finally {
      setIsSaving(false)
    }
  }

  const handleEditItem = (item: ProjectGridItem) => {
    setItemForm({
      module: item.module,
      type: item.type,
      description: item.description,
      complexity: item.complexity,
      notes: item.notes,
    })
    setEditingItemId(item.id)
    setError(null)
    setSuccess(null)
  }

  const handleDeleteItem = async (itemId: number) => {
    if (!selectedProject) return

    setError(null)
    setSuccess(null)
    setIsSaving(true)
    try {
      const response = await fetch(apiUrl(`/api/projeto-dev/projects/${selectedProject.id}/items/${itemId}`), {
        method: 'DELETE',
      })
      if (!response.ok) {
        let detail = 'Falha ao excluir item.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      const data = await response.json() as { item?: unknown }
      const updatedProject = normalizeProject(data.item)
      if (updatedProject) {
        setProjects((prev) => prev.map((project) => (project.id === updatedProject.id ? updatedProject : project)))
      } else {
        await fetchProjects()
      }

      if (editingItemId === itemId) resetItemForm()
      setSuccess('Item removido com sucesso.')
    } catch (deleteError) {
      const detail = deleteError instanceof Error ? deleteError.message : 'Falha ao excluir item.'
      setError(detail)
    } finally {
      setIsSaving(false)
    }
  }

  const handleExportItems = () => {
    if (!selectedProject || !selectedProject.items.length) {
      setError('Nao ha itens cadastrados para exportar neste projeto.')
      return
    }

    try {
      const rows = selectedProject.items.map((item, index) => ({
        '#': index + 1,
        Modulo: item.module,
        Tipo: ITEM_TYPE_LABELS[item.type],
        Complexidade: COMPLEXITY_LABELS[item.complexity],
        Descricao: item.description,
        Observacoes: item.notes || '',
      }))

      const workbook = XLSX.utils.book_new()
      const worksheet = XLSX.utils.json_to_sheet(rows)
      XLSX.utils.book_append_sheet(workbook, worksheet, 'itens-projeto')

      const dateTag = new Date().toISOString().slice(0, 10)
      const safeClient = selectedProject.client
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        || 'projeto'

      XLSX.writeFile(workbook, `${safeClient}-itens-${dateTag}.xlsx`)
      setSuccess('Planilha de itens gerada com sucesso.')
    } catch {
      setError('Falha ao gerar planilha de itens.')
    }
  }

  return (
    <div className={`customer-hub rule-tool ${currentScreen === 'workspace' ? 'rule-tool--workspace' : 'rule-tool--overview'} projeto-dev`}>
      {error && <p className="error">{error}</p>}
      {success && <p className="success">{success}</p>}

      {currentScreen === 'overview' ? (
        <section className="card">
          <div className="ch-section-header">
            <div>
              <h2>Cadastros de Projeto Dev</h2>
              <p className="muted">Cadastre os dados basicos do projeto e, depois de salvo, utilize o botao Itens para detalhar as entregas por modulo.</p>
            </div>
            <div className="ch-header-actions">
              <button
                type="button"
                className="button-primary"
                onClick={() => {
                  resetProjectForm()
                  setSelectedProjectId(null)
                  openWorkspace(null)
                }}
              >
                Novo Projeto
              </button>
            </div>
          </div>

          <div className="rule-tool__toolbar projeto-dev__toolbar projeto-dev__toolbar--overview">
            <div>
              <h3>Projetos cadastrados</h3>
              <p className="muted projeto-dev__meta">
                {isLoading ? 'Carregando projetos...' : `Total: ${filteredProjects.length} de ${projects.length}`}
              </p>
            </div>
            <div className="rule-tool__toolbar-actions">
              <label className="ch-table-search projeto-dev__search" aria-label="Buscar projetos">
                <span className="ch-table-search__icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="7" />
                    <line x1="16.5" y1="16.5" x2="21" y2="21" />
                  </svg>
                </span>
                <input
                  type="search"
                  value={projectSearch}
                  onChange={(event) => setProjectSearch(event.target.value)}
                  placeholder="Buscar por cliente, data ou Descrição"
                />
              </label>
            </div>
          </div>

          {isLoading ? (
            <p className="muted">Carregando projetos...</p>
          ) : filteredProjects.length === 0 ? (
            <div className="rule-tool__empty-state">
              <h3>Nenhum projeto encontrado</h3>
              <p className="muted">Crie um novo projeto com os dados cadastrais basicos e depois complemente as informacoes pelo botao Itens.</p>
              <button
                type="button"
                className="button-primary"
                onClick={() => {
                  resetProjectForm()
                  setSelectedProjectId(null)
                  openWorkspace(null)
                }}
              >
                Novo Projeto
              </button>
            </div>
          ) : (
            <div className="rule-tool__set-grid">
              {filteredProjects.map((project) => (
                <article key={project.id} className={`rule-tool__set-card ${selectedProjectId === project.id ? 'rule-tool__set-card--active' : ''}`}>
                  <div>
                    <h3>{project.client}</h3>
                    <p className="muted">Data: {formatProjectDate(project.date)}</p>
                    <p className="muted">{project.description}</p>
                    <p className="muted">Itens cadastrados: {project.items.length}</p>
                  </div>
                  <div className="ch-header-actions">
                    <button type="button" className="button-primary" onClick={() => handleEditProject(project)}>
                      Abrir
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => handleOpenProjectItems(project)}
                      disabled={isSaving}
                    >
                      Itens
                    </button>
                    <button type="button" className="button-secondary" onClick={() => void handleDeleteProject(project.id)} disabled={isSaving}>
                      Excluir
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ) : (
        currentScreen === 'workspace' ? (
        <div className="rule-tool__workspace">
          <section className="card projeto-dev__form-card">
            <div className="ch-section-header">
              <div>
                <h2>Cadastro de Projeto Dev</h2>
                <p className="muted">Informe os dados cadastrais do projeto. Depois de salvo, utilize o botao Itens para montar o detalhamento tecnico.</p>
              </div>
              <div className="ch-header-actions rule-tool__header-actions">
                <button type="button" className="button-secondary" onClick={goToOverview}>
                  Voltar para a Tela Inicial
                </button>
                <button
                  type="button"
                  className="button-primary"
                  onClick={() => {
                    resetProjectForm()
                    setSelectedProjectId(null)
                  }}
                  disabled={isSaving}
                >
                  + Novo Projeto
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    if (selectedProject) openItemsScreen(selectedProject)
                  }}
                  disabled={!selectedProject || isSaving}
                >
                  Itens do Projeto
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveProject} className="form-grid rule-tool__controls projeto-dev__form">
              <label>
                Projeto ativo
                <select
                  value={selectedProjectId ?? ''}
                  onChange={(event) => {
                    const nextId = event.target.value ? Number(event.target.value) : null
                    if (!nextId) {
                      setSelectedProjectId(null)
                      resetProjectForm()
                      return
                    }

                    const nextProject = projects.find((project) => project.id === nextId)
                    if (nextProject) {
                      selectProjectForForm(nextProject)
                    }
                  }}
                  disabled={isLoading || projects.length === 0}
                >
                  <option value="">Nenhum projeto selecionado</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.client} - {formatProjectDate(project.date)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cliente
                <input
                  type="text"
                  value={projectForm.client}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, client: event.target.value }))}
                  placeholder="Nome do cliente"
                  required
                />
              </label>
              <label>
                Data
                <input
                  type="date"
                  value={projectForm.date}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, date: event.target.value }))}
                  required
                />
              </label>
              <label className="form-grid__full">
                Descrição
                <textarea
                  rows={3}
                  value={projectForm.description}
                  onChange={(event) => setProjectForm((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="Descreva o escopo do projeto"
                  required
                />
              </label>
              <div className="form-grid__actions projeto-dev__actions">
                {editingProjectId && (
                  <button type="button" className="button-secondary" onClick={resetProjectForm} disabled={isSaving}>
                    Cancelar edicao
                  </button>
                )}
                <button type="submit" className="button-primary" disabled={isSaving}>
                  {editingProjectId ? 'Salvar alteracoes' : 'Cadastrar projeto'}
                </button>
              </div>
            </form>
          </section>
        </div>
        ) : (
        <div className="rule-tool__workspace">
          <section className="card projeto-dev__items-screen-card">
            <div className="ch-section-header">
              <div>
                <h2>Itens do Projeto</h2>
                <p className="muted projeto-dev__meta">
                  {selectedProject
                    ? `Projeto: ${selectedProject.client} • ${filteredProjectItems.length} de ${selectedProject.items.length} itens`
                    : 'Selecione um projeto na tela inicial para gerenciar os itens.'}
                </p>
              </div>
              <div className="ch-header-actions rule-tool__header-actions">
                <button type="button" className="button-secondary" onClick={goToOverview}>
                  Voltar para a Tela Inicial
                </button>
              </div>
            </div>

            {selectedProject && (
              <section className="projeto-dev__project-summary">
                <article className="projeto-dev__summary-card">
                  <span className="projeto-dev__summary-label">Cliente</span>
                  <strong>{selectedProject.client}</strong>
                </article>
                <article className="projeto-dev__summary-card">
                  <span className="projeto-dev__summary-label">Data</span>
                  <strong>{formatProjectDate(selectedProject.date)}</strong>
                </article>
                <article className="projeto-dev__summary-card projeto-dev__summary-card--wide">
                  <span className="projeto-dev__summary-label">Descrição do projeto</span>
                  <strong>{selectedProject.description}</strong>
                </article>
                <article className="projeto-dev__summary-card">
                  <span className="projeto-dev__summary-label">Itens cadastrados</span>
                  <strong>{selectedProject.items.length}</strong>
                </article>
              </section>
            )}

            <div className="projeto-dev__items-layout">
              <section className="projeto-dev__item-panel projeto-dev__item-panel--screen projeto-dev__item-form-card">
                <div className="projeto-dev__item-panel-head">
                  <div>
                    <h4>{editingItemId ? 'Editar item do projeto' : 'Novo item do projeto'}</h4>
                    <p className="muted">Cadastre o modulo, tipo, Descrição funcional e a complexidade da entrega.</p>
                  </div>
                </div>

                <form onSubmit={handleSaveItem} className="form-grid rule-tool__controls projeto-dev__item-form">
                  <label>
                    Modulo
                    <input
                      type="text"
                      value={itemForm.module}
                      onChange={(event) => setItemForm((prev) => ({ ...prev, module: event.target.value }))}
                      placeholder="Ex.: Financeiro"
                      required
                    />
                  </label>
                  <label>
                    Tipo
                    <select
                      value={itemForm.type}
                      onChange={(event) => setItemForm((prev) => ({ ...prev, type: event.target.value as ProjectItemType }))}
                    >
                      <option value="cadastro">Cadastro</option>
                      <option value="processo">Processo</option>
                      <option value="relatorio">Relatório</option>
                      <option value="formula">Fórmula</option>
                      <option value="dicionario">Dicionário</option>
                      <option value="workflow">Workflow</option>
                      <option value="outros">Outros</option>
                    </select>
                  </label>
                  <label>
                    Complexidade
                    <select
                      value={itemForm.complexity}
                      onChange={(event) => setItemForm((prev) => ({ ...prev, complexity: event.target.value as ProjectItemComplexity }))}
                    >
                      <option value="baixa">Baixa</option>
                      <option value="media">Media</option>
                      <option value="alta">Alta</option>
                    </select>
                  </label>
                  <label className="form-grid__full">
                    Descrição
                    <textarea
                      rows={4}
                      value={itemForm.description}
                      onChange={(event) => setItemForm((prev) => ({ ...prev, description: event.target.value }))}
                      placeholder="Descreva a atividade, objetivo ou funcionalidade que sera entregue"
                      required
                    />
                  </label>
                  <label className="form-grid__full">
                    Observações
                    <textarea
                      rows={4}
                      value={itemForm.notes}
                      onChange={(event) => setItemForm((prev) => ({ ...prev, notes: event.target.value }))}
                      placeholder="Dependencias, premissas, detalhes tecnicos ou Observações complementares"
                    />
                  </label>
                  <div className="form-grid__actions projeto-dev__actions">
                    {editingItemId && (
                      <button type="button" className="button-secondary" onClick={resetItemForm} disabled={isSaving}>
                        Cancelar edicao
                      </button>
                    )}
                    <button type="submit" className="button-primary" disabled={isSaving || !selectedProject}>
                      {editingItemId ? 'Salvar item' : 'Incluir item'}
                    </button>
                  </div>
                </form>
              </section>

              <section className="projeto-dev__item-list-card">
                <div>
                  <div className="projeto-dev__item-panel-head projeto-dev__item-panel-head--list">
                    <div>
                      <h4>Itens cadastrados</h4>
                      <p className="muted">Consulte, filtre e edite os itens vinculados a este projeto.</p>
                    </div>
                    <div className="projeto-dev__list-actions">
                      <label className="ch-table-search projeto-dev__search" aria-label="Buscar itens do projeto">
                        <span className="ch-table-search__icon" aria-hidden="true">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="7" />
                            <line x1="16.5" y1="16.5" x2="21" y2="21" />
                          </svg>
                        </span>
                        <input
                          type="search"
                          value={itemSearch}
                          onChange={(event) => setItemSearch(event.target.value)}
                          placeholder="Buscar modulo, tipo, Descrição..."
                          disabled={!selectedProject}
                        />
                      </label>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={handleExportItems}
                        disabled={!selectedProject || !selectedProject.items.length}
                      >
                        Exportar planilha
                      </button>
                    </div>
                  </div>
                </div>
                <div className="rule-tool__table-wrap projeto-dev__table-wrap projeto-dev__table-wrap--screen estimativas-table ch-table-theme">
                  <table className="projeto-dev__table projeto-dev__table--modal">
                    <thead>
                      <tr>
                        <th className="projeto-dev__col-index">#</th>
                        <th className="projeto-dev__col-module">Modulo</th>
                        <th className="projeto-dev__col-type">Tipo</th>
                        <th className="projeto-dev__col-complexity">Complexidade</th>
                        <th className="projeto-dev__col-actions">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProjectItems.map((item, index) => (
                        <tr key={item.id}>
                          <td className="projeto-dev__cell projeto-dev__cell--index">{index + 1}</td>
                          <td className="projeto-dev__cell projeto-dev__cell--module">{item.module}</td>
                          <td className="projeto-dev__cell projeto-dev__cell--type">
                            <span className={`projeto-dev__badge ${ITEM_TYPE_BADGE_CLASS[item.type]}`}>
                              {ITEM_TYPE_LABELS[item.type]}
                            </span>
                          </td>
                          <td className="projeto-dev__cell projeto-dev__cell--complexity">
                            <span className={`projeto-dev__badge ${ITEM_COMPLEXITY_BADGE_CLASS[item.complexity]}`}>
                              {COMPLEXITY_LABELS[item.complexity]}
                            </span>
                          </td>
                          <td className="projeto-dev__cell projeto-dev__cell--actions">
                            <div className="projeto-dev__row-actions ch-row-actions ch-row-actions--icons">
                              <button type="button" className="ch-icon-action" title="Detalhes" onClick={() => setDetailItem(item)} disabled={isSaving}>
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <circle cx="12" cy="12" r="3" />
                                  <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7Z" />
                                </svg>
                              </button>
                              <button type="button" className="ch-icon-action" title="Editar" onClick={() => handleEditItem(item)} disabled={isSaving}>
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M12 20h9" />
                                  <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                                </svg>
                              </button>
                              <button type="button" className="ch-icon-action ch-icon-action--danger" title="Excluir" onClick={() => void handleDeleteItem(item.id)} disabled={isSaving}>
                                <svg viewBox="0 0 24 24" aria-hidden="true">
                                  <path d="M3 6h18" />
                                  <path d="M8 6V4h8v2" />
                                  <path d="M6 6l1 14h10l1-14" />
                                  <path d="M10 10v7M14 10v7" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!filteredProjectItems.length && <p className="muted projeto-dev__empty">Nenhum item encontrado.</p>}
              </section>

              {detailItem && (
                <div className="projeto-dev__details-overlay" role="dialog" aria-modal="true" aria-label="Detalhes do item">
                  <article className="projeto-dev__details-modal">
                    <header className="projeto-dev__details-header">
                      <h4>Detalhes do item</h4>
                      <button type="button" className="button-secondary" onClick={() => setDetailItem(null)}>
                        Fechar
                      </button>
                    </header>
                    <div className="projeto-dev__details-grid">
                      <div>
                        <span className="projeto-dev__details-label">Modulo</span>
                        <strong>{detailItem.module}</strong>
                      </div>
                      <div>
                        <span className="projeto-dev__details-label">Tipo</span>
                        <strong>{ITEM_TYPE_LABELS[detailItem.type]}</strong>
                      </div>
                      <div>
                        <span className="projeto-dev__details-label">Complexidade</span>
                        <strong>{COMPLEXITY_LABELS[detailItem.complexity]}</strong>
                      </div>
                    </div>
                    <section className="projeto-dev__details-section">
                      <h5>Descrição</h5>
                      <p>{detailItem.description}</p>
                    </section>
                    <section className="projeto-dev__details-section">
                      <h5>Observações</h5>
                      <p>{detailItem.notes || 'Nenhuma observação informada.'}</p>
                    </section>
                  </article>
                </div>
              )}
            </div>
          </section>
        </div>
        )
      )}
    </div>
  )
}
