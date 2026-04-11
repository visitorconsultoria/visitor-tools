import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { apiUrl } from '../lib/api'

type MenuPermission = 'process' | 'xml-excel' | 'excel-csv-sqlite' | 'resume-ranking' | 'estimativas' | 'daily-activities'

type UserRow = {
  id: number
  username: string
  displayName: string
  isActive: boolean
  allowedMenus: MenuPermission[]
}

type UserFormState = {
  username: string
  password: string
  displayName: string
  isActive: boolean
  allowedMenus: MenuPermission[]
}

type UserAccessToolProps = {
  currentUsername: string
}

const MENU_OPTIONS: Array<{ key: MenuPermission, label: string }> = [
  { key: 'process', label: 'Comparar Projeto' },
  { key: 'xml-excel', label: 'XML para Excel' },
  { key: 'excel-csv-sqlite', label: 'Excel/CSV para SQL' },
  { key: 'resume-ranking', label: 'Ranking de Curriculos' },
  { key: 'estimativas', label: 'Estimativas' },
  { key: 'daily-activities', label: 'Apontamentos' },
]

const EMPTY_FORM: UserFormState = {
  username: '',
  password: '',
  displayName: '',
  isActive: true,
  allowedMenus: [],
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

function normalizeUser(input: unknown): UserRow {
  const row = input as Partial<UserRow>
  const permissions = Array.isArray(row.allowedMenus) ? row.allowedMenus : []

  return {
    id: Number(row.id ?? 0),
    username: String(row.username ?? ''),
    displayName: String(row.displayName ?? ''),
    isActive: Boolean(row.isActive),
    allowedMenus: permissions
      .map((item) => String(item))
      .filter((item): item is MenuPermission => MENU_OPTIONS.some((opt) => opt.key === item)),
  }
}

export default function UserAccessTool({ currentUsername }: UserAccessToolProps) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const isVisitor = currentUsername.trim().toLowerCase() === 'visitor'
  const isEditingVisitor = editingId !== null && form.username.trim().toLowerCase() === 'visitor'

  const headerValue = useMemo(
    () => ({ 'x-admin-user': currentUsername.trim().toLowerCase() }),
    [currentUsername],
  )

  const fetchUsers = async () => {
    setError(null)
    setIsLoading(true)

    try {
      const response = await fetch(apiUrl('/api/users'), { headers: headerValue })
      if (!response.ok) {
        let detail = 'Falha ao carregar usuarios.'
        try {
          const err = await response.json()
          detail = (err as { error?: string })?.error ?? detail
        } catch {
          detail = response.statusText || detail
        }
        throw new Error(detail)
      }

      const data = await response.json() as { items?: unknown[] }
      const nextItems = Array.isArray(data.items) ? data.items.map(normalizeUser) : []
      setUsers(nextItems)
    } catch (loadError) {
      setError(toFriendlyApiError(loadError, 'Nao foi possivel carregar usuarios.'))
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!isVisitor) return
    void fetchUsers()
  }, [isVisitor])

  const resetForm = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const startEdit = (user: UserRow) => {
    setEditingId(user.id)
    setError(null)
    setSuccess(null)
    setForm({
      username: user.username,
      password: '',
      displayName: user.displayName,
      isActive: user.isActive,
      allowedMenus: user.allowedMenus,
    })
  }

  const togglePermission = (permission: MenuPermission) => {
    setForm((prev) => {
      const hasPermission = prev.allowedMenus.includes(permission)
      return {
        ...prev,
        allowedMenus: hasPermission
          ? prev.allowedMenus.filter((item) => item !== permission)
          : [...prev.allowedMenus, permission],
      }
    })
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!form.username.trim()) {
      setError('Informe o usuario.')
      return
    }

    if (!editingId && !form.password.trim()) {
      setError('Informe a senha para novos usuarios.')
      return
    }

    if (isEditingVisitor && !form.password.trim()) {
      setError('Para o usuario visitor, informe a nova senha.')
      return
    }

    if (!form.allowedMenus.length && form.username.trim().toLowerCase() !== 'visitor') {
      setError('Selecione ao menos um item de menu.')
      return
    }

    const payload = {
      username: form.username.trim(),
      password: form.password,
      displayName: form.displayName.trim(),
      isActive: form.isActive,
      allowedMenus: form.allowedMenus,
    }

    try {
      setIsSaving(true)
      const response = await fetch(apiUrl(editingId ? `/api/users/${editingId}` : '/api/users'), {
        method: editingId ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headerValue,
        },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        let detail = editingId ? 'Falha ao atualizar usuario.' : 'Falha ao cadastrar usuario.'
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
        throw new Error('Resposta invalida ao salvar usuario.')
      }

      const saved = normalizeUser(data.item)
      setUsers((prev) => {
        if (!editingId) return [...prev, saved]
        return prev.map((item) => (item.id === editingId ? saved : item))
      })
      setSuccess(editingId ? 'Usuario atualizado com sucesso.' : 'Usuario cadastrado com sucesso.')
      resetForm()
    } catch (saveError) {
      setError(toFriendlyApiError(saveError, 'Nao foi possivel salvar usuario.'))
    } finally {
      setIsSaving(false)
    }
  }

  if (!isVisitor) {
    return (
      <section className="card">
        <h2>Cadastro de Usuarios</h2>
        <p className="error">Acesso restrito ao usuario visitor.</p>
      </section>
    )
  }

  return (
    <div className="grid user-admin-layout">
      <section className="card">
        <h2>{editingId ? 'Editar Usuario' : 'Novo Usuario'}</h2>
        <p className="muted user-admin-form__intro">
          Defina credenciais e libere apenas os menus necessarios para cada usuario.
        </p>

        <form className="estimativas-form user-admin-form" onSubmit={handleSubmit}>
          <label>
            Usuario *
            <input
              value={form.username}
              onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value.toLowerCase() }))}
              placeholder="Ex: jserrano"
              readOnly={isEditingVisitor}
            />
          </label>
          <label>
            Senha {editingId ? (isEditingVisitor ? '*' : '(opcional)') : '*'}
            <input
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder={editingId ? (isEditingVisitor ? 'Nova senha do visitor' : 'Preencha apenas para alterar') : 'Senha de acesso'}
            />
          </label>

          <label className="estimativas-form__full">
            Nome de exibicao
            <input
              value={form.displayName}
              onChange={(event) => setForm((prev) => ({ ...prev, displayName: event.target.value }))}
              placeholder="Ex: Joao Serrano"
              readOnly={isEditingVisitor}
            />
          </label>

          <label className="estimativas-form__full checkbox" style={{ marginTop: '0.2rem' }}>
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              disabled={isEditingVisitor}
            />
            Usuario ativo
          </label>

          <div className="estimativas-form__full user-admin-form__permissions">
            <strong>Permissoes de menu</strong>
            <div className="user-admin-form__permissions-grid">
              {MENU_OPTIONS.map((option) => (
                <label key={option.key} className="checkbox user-admin-form__permission-item">
                  <input
                    type="checkbox"
                    checked={form.allowedMenus.includes(option.key)}
                    onChange={() => togglePermission(option.key)}
                    disabled={isEditingVisitor || form.username.trim().toLowerCase() === 'visitor'}
                  />
                  {option.label}
                </label>
              ))}
            </div>
            {isEditingVisitor && (
              <p className="muted" style={{ marginTop: '0.5rem' }}>
                O usuario visitor permite apenas alteracao de senha.
              </p>
            )}
            {!isEditingVisitor && form.username.trim().toLowerCase() === 'visitor' && (
              <p className="muted" style={{ marginTop: '0.5rem' }}>
                O usuario visitor sempre possui acesso completo aos menus.
              </p>
            )}
          </div>

          <div className="estimativas-actions estimativas-form__full">
            <button type="submit" className="button-primary" disabled={isSaving}>
              {isSaving ? 'Salvando...' : editingId ? (isEditingVisitor ? 'Atualizar senha' : 'Atualizar') : 'Cadastrar'}
            </button>
            <button type="button" className="button-secondary" onClick={resetForm} disabled={isSaving}>
              Limpar
            </button>
          </div>

          {error && <p className="error estimativas-form__full">{error}</p>}
          {success && <p className="success estimativas-form__full">{success}</p>}
        </form>
      </section>

      <section className="card">
        <div className="estimativas-header-row">
          <h2>Usuarios Cadastrados</h2>
          <button type="button" className="button-secondary" onClick={() => void fetchUsers()} disabled={isLoading}>
            {isLoading ? 'Atualizando...' : 'Atualizar'}
          </button>
        </div>

        <div className="estimativas-table" style={{ marginTop: '0.8rem' }}>
          <table>
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Nome</th>
                <th>Status</th>
                <th>Acessos</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.displayName || '-'}</td>
                  <td>{user.isActive ? 'Ativo' : 'Inativo'}</td>
                  <td>{user.username === 'visitor' ? 'Completo' : user.allowedMenus.join(', ') || '-'}</td>
                  <td>
                    <button type="button" className="button-secondary" onClick={() => startEdit(user)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
              {!users.length && (
                <tr>
                  <td colSpan={5}>Nenhum usuario cadastrado.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
