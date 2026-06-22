import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { apiUrl } from '../lib/api'

type RubricaCatalog = {
  catalogKey: string
  label: string
  allowMultipleLinks: boolean
}

type RubricaItem = {
  id: number
  code: string
  shortDescription: string
  fullDescription: string
  validFrom: string | null
  validTo: string | null
  referenceLinks: string[]
}

type RubricaItemForm = {
  id?: number
  code: string
  shortDescription: string
  fullDescription: string
  validFrom: string
  validTo: string
  referenceLinksText: string
}

type RubricaCatalogPageKey =
  | 'rubrica-natureza'
  | 'rubrica-inc-cp'
  | 'rubrica-inc-fgts'
  | 'rubrica-inc-pis'
  | 'rubrica-inc-rpps'
  | 'rubrica-inc-irrf'
  | 'rubrica-dirf'
  | 'rubrica-id-calculo'

const EMPTY_FORM: RubricaItemForm = {
  code: '',
  shortDescription: '',
  fullDescription: '',
  validFrom: '',
  validTo: '',
  referenceLinksText: '',
}

const CATALOG_KEYS: Record<RubricaCatalogPageKey, string> = {
  'rubrica-natureza': 'natureza-rubricas',
  'rubrica-inc-cp': 'inc-cp',
  'rubrica-inc-fgts': 'inc-fgts',
  'rubrica-inc-pis': 'inc-pis',
  'rubrica-inc-rpps': 'inc-rpps',
  'rubrica-inc-irrf': 'inc-irrf',
  'rubrica-dirf': 'dirf-protheus',
  'rubrica-id-calculo': 'id-calculo-protheus',
}

function toISODate(value: string): string {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text

  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`

  return text
}

function toDisplayDate(value: string | null): string {
  if (!value) return '-'
  const iso = toISODate(value)
  const [year, month, day] = iso.split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${year}`
}

function normalizeRubricaLinks(value: unknown): string[] {
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item ?? '').trim()).filter(Boolean)))
  }
  return []
}

function mapRubricaItemRow(row: unknown): RubricaItem {
  const data = (row && typeof row === 'object') ? row as Record<string, unknown> : {}
  return {
    id: Number(data.id ?? 0),
    code: String(data.code ?? ''),
    shortDescription: String(data.shortDescription ?? data.short_description ?? ''),
    fullDescription: String(data.fullDescription ?? data.full_description ?? ''),
    validFrom: data.validFrom ? String(data.validFrom) : data.valid_from ? String(data.valid_from) : null,
    validTo: data.validTo ? String(data.validTo) : data.valid_to ? String(data.valid_to) : null,
    referenceLinks: normalizeRubricaLinks(data.referenceLinks ?? data.reference_links),
  }
}

function toFriendlyApiError(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string' && error.trim()) return error
  return fallback
}

interface RubricasValidationToolProps {
  catalogPageKey: RubricaCatalogPageKey
}

export default function RubricasValidationTool({ catalogPageKey }: RubricasValidationToolProps) {
  const catalogKey = CATALOG_KEYS[catalogPageKey]

  const [catalog, setCatalog] = useState<RubricaCatalog | null>(null)
  const [items, setItems] = useState<RubricaItem[]>([])
  const [search, setSearch] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<RubricaItemForm>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  const fetchCatalogAndItems = async () => {
    setError(null)
    setIsLoading(true)

    try {
      const [catalogRes, itemsRes] = await Promise.all([
        fetch(apiUrl('/api/rubricas/catalogs')),
        fetch(apiUrl(`/api/rubricas/catalogs/${catalogKey}/items`)),
      ])

      if (!catalogRes.ok) {
        const text = await catalogRes.text()
        throw new Error(text || 'Falha ao carregar os catálogos de rubricas.')
      }

      if (!itemsRes.ok) {
        const text = await itemsRes.text()
        throw new Error(text || 'Falha ao carregar os registros do catálogo.')
      }

      const catalogBody = await catalogRes.json() as { items?: unknown[] }
      const itemBody = await itemsRes.json() as { items?: unknown[] }

      const catalogs = Array.isArray(catalogBody.items) ? catalogBody.items : []
      const found = catalogs.find((entry) => {
        if (!entry || typeof entry !== 'object') return false
        const row = entry as Record<string, unknown>
        return String(row.key ?? row.catalogKey ?? '') === catalogKey
      })

      if (found && typeof found === 'object') {
        const row = found as Record<string, unknown>
        setCatalog({
          catalogKey,
          label: String(row.label ?? row.catalogLabel ?? ''),
          allowMultipleLinks: Boolean(row.allowMultipleLinks),
        })
      } else {
        setCatalog({ catalogKey, label: catalogKey, allowMultipleLinks: false })
      }

      const nextItems = Array.isArray(itemBody.items) ? itemBody.items.map(mapRubricaItemRow) : []
      setItems(nextItems)
    } catch (err) {
      setItems([])
      setError(toFriendlyApiError(err, 'Nao foi possivel carregar os dados do cadastro.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void fetchCatalogAndItems()
  }, [catalogKey])

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return items

    return items.filter((item) =>
      [item.code, item.shortDescription, item.fullDescription, item.referenceLinks.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [items, search])

  const openCreateModal = () => {
    setError(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  const openEditModal = (item: RubricaItem) => {
    setError(null)
    setForm({
      id: item.id,
      code: item.code,
      shortDescription: item.shortDescription,
      fullDescription: item.fullDescription,
      validFrom: item.validFrom ?? '',
      validTo: item.validTo ?? '',
      referenceLinksText: item.referenceLinks.join('\n'),
    })
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setForm(EMPTY_FORM)
  }

  const setFormField = (field: keyof RubricaItemForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!form.code.trim() || !form.shortDescription.trim() || !form.fullDescription.trim()) {
      setError('Codigo, descricao abreviada e descricao completa sao obrigatorios.')
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      const payload = {
        code: form.code.trim(),
        shortDescription: form.shortDescription.trim(),
        fullDescription: form.fullDescription.trim(),
        validFrom: form.validFrom ? toISODate(form.validFrom) : null,
        validTo: form.validTo ? toISODate(form.validTo) : null,
        referenceLinksText: form.referenceLinksText,
      }

      const isEdit = Boolean(form.id)
      const url = isEdit
        ? apiUrl(`/api/rubricas/catalogs/${catalogKey}/items/${form.id}`)
        : apiUrl(`/api/rubricas/catalogs/${catalogKey}/items`)

      const response = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const bodyText = await response.text()
      const body = bodyText ? JSON.parse(bodyText) as { error?: string } : null

      if (!response.ok) {
        throw new Error(body?.error ?? `Falha ao salvar cadastro (${response.status}).`)
      }

      closeModal()
      await fetchCatalogAndItems()
    } catch (err) {
      setError(toFriendlyApiError(err, 'Nao foi possivel salvar o cadastro.'))
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (itemId: number) => {
    if (!window.confirm('Excluir este registro?')) return

    setError(null)

    try {
      const response = await fetch(apiUrl(`/api/rubricas/catalogs/${catalogKey}/items/${itemId}`), {
        method: 'DELETE',
      })

      const bodyText = await response.text()
      const body = bodyText ? JSON.parse(bodyText) as { error?: string } : null

      if (!response.ok) {
        throw new Error(body?.error ?? `Falha ao excluir cadastro (${response.status}).`)
      }

      await fetchCatalogAndItems()
    } catch (err) {
      setError(toFriendlyApiError(err, 'Nao foi possivel excluir o cadastro.'))
    }
  }

  return (
    <div className="customer-hub">
      {modalOpen && createPortal(
        <div className="estimativas-modal-overlay" role="presentation" onClick={closeModal}>
          <section className="estimativas-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="estimativas-modal__header">
              <h3>{form.id ? 'Editar Cadastro' : 'Novo Cadastro'}</h3>
              <button type="button" className="button-secondary" onClick={closeModal}>Fechar</button>
            </div>

            <form className="estimativas-form" onSubmit={(event) => { void handleSave(event) }}>
              <label>
                Codigo *
                <input
                  value={form.code}
                  onChange={(event) => setFormField('code', event.target.value)}
                  required
                />
              </label>
              <label>
                Data Inicio
                <input
                  type="date"
                  value={form.validFrom}
                  onChange={(event) => setFormField('validFrom', event.target.value)}
                />
              </label>
              <label>
                Descricao Abreviada *
                <input
                  value={form.shortDescription}
                  onChange={(event) => setFormField('shortDescription', event.target.value)}
                  required
                />
              </label>
              <label>
                Data Fim
                <input
                  type="date"
                  value={form.validTo}
                  onChange={(event) => setFormField('validTo', event.target.value)}
                />
              </label>
              <label className="estimativas-form__full">
                Descricao Completa *
                <textarea
                  rows={3}
                  value={form.fullDescription}
                  onChange={(event) => setFormField('fullDescription', event.target.value)}
                  required
                />
              </label>
              <label className="estimativas-form__full">
                Links de Referencia {catalog?.allowMultipleLinks ? '(um por linha)' : '(somente um link)'}
                <textarea
                  rows={3}
                  value={form.referenceLinksText}
                  onChange={(event) => setFormField('referenceLinksText', event.target.value)}
                  placeholder="https://exemplo.com"
                />
              </label>

              <div className="estimativas-actions estimativas-form__full">
                <button type="submit" className="button-primary" disabled={isSaving}>
                  {isSaving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </section>
        </div>,
        document.body,
      )}

      <section className="card">
        <div className="ch-section-header">
          <div>
            <h2>{catalog?.label || 'Cadastro de Rubricas'}</h2>
            <p className="muted">Cadastro basico com dados de referencia e vigencia.</p>
          </div>
          <div className="ch-header-actions">
            <button type="button" className="button-primary" onClick={openCreateModal} disabled={isLoading}>
              + Novo Cadastro
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
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por codigo, descricao ou link..."
              aria-label="Buscar registro"
            />
          </label>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="csv-table ch-table-theme">
          <table>
            <thead>
              <tr>
                <th>Codigo</th>
                <th>Descricao Abreviada</th>
                <th>Descricao Completa</th>
                <th>Vigencia</th>
                <th>Links</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.code}</td>
                  <td>{item.shortDescription}</td>
                  <td>{item.fullDescription}</td>
                  <td>{`${toDisplayDate(item.validFrom)}${item.validTo ? ` ate ${toDisplayDate(item.validTo)}` : ''}`}</td>
                  <td>
                    {item.referenceLinks.length === 0 ? (
                      '-'
                    ) : item.referenceLinks.length === 1 ? (
                      <a href={item.referenceLinks[0]} target="_blank" rel="noreferrer">Link</a>
                    ) : (
                      `${item.referenceLinks.length} links`
                    )}
                  </td>
                  <td>
                    <div className="ch-row-actions ch-row-actions--icons">
                      <button type="button" className="ch-icon-action" aria-label="Editar cadastro" title="Editar" onClick={() => openEditModal(item)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#315f53" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button type="button" className="ch-icon-action ch-icon-action--danger" aria-label="Excluir cadastro" title="Excluir" onClick={() => handleDelete(item.id)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="ch-empty">{isLoading ? 'Carregando registros...' : 'Nenhum registro encontrado.'}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
